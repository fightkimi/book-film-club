const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const {createClient} = require("../../miniprogram/lib/api");

function client() {
  const calls = [];
  let deviceReads = 0, defer = false;
  const api = createClient({
    getDeviceInfo() {deviceReads++; return {platform:"ios"};},
    request(o) {
      calls.push(o);
      if (!defer) o.success({statusCode:200, data:{value:calls.length}, cookies:["club_session=fixture-only"]});
    },
  }, {baseUrl:"https://club.example.com"});
  return {api,calls,deviceReads:()=>deviceReads,defer(value){defer=value;}};
}
test("returning to a view reuses one bounded session read and writes invalidate it", async () => {
  const h = client(); await h.api.request("/api/session-fixture");
  const path = "/api/bookstores/personal/list?month=2026-11";
  const first = await h.api.readCached(path);
  for (let i=0;i<10;i++) assert.equal(await h.api.readCached(path),first);
  assert.equal(h.calls.filter(o=>o.url.endsWith(path)).length,1);
  await h.api.request("/api/bookstores/personal/save",{});
  assert.notEqual(await h.api.readCached(path),first);
  assert.equal(h.deviceReads(),1);
  h.api.clear();
  await assert.rejects(h.api.readCached(path),e=>e.status===401);
});
test("pending reads deduplicate, failures retry and an old request cannot populate a new session", async () => {
  const h = client(); await h.api.request("/api/session-fixture"); h.defer(true);
  const a=h.api.readCached("/api/bookstores/feed"), b=h.api.readCached("/api/bookstores/feed");
  assert.equal(a,b);
  h.calls.at(-1).fail(); await assert.rejects(a);
  const pending=h.api.readCached("/api/bookstores/feed");
  const old=h.calls.at(-1); h.api.clear();
  old.success({statusCode:200,data:{private:"old user"}});
  await assert.rejects(pending,/登录状态/);
  assert.equal(h.api.hasSession(),false);
  h.defer(false); await h.api.request("/api/session-fixture");
  const value=await h.api.readCached("/api/bookstores/feed");
  assert.equal(value.private,undefined);
});
test("a read started during a write is invalidated again when that write completes", async () => {
  const h=client(); await h.api.request("/api/session-fixture"); h.defer(true);
  const mutation=h.api.request("/api/bookstores/follow",{}), write=h.calls.at(-1);
  const pending=h.api.readCached("/api/bookstores/catalog"), read=h.calls.at(-1);
  read.success({statusCode:200,data:{old:true}}); await pending;
  write.success({statusCode:200,data:{ok:true}}); await mutation;
  h.defer(false);
  assert.equal((await h.api.readCached("/api/bookstores/catalog")).old,undefined);
});
test("return preserves native content and draft; logout clears it immediately and rejects late setData", async () => {
  const h=client(); await h.api.request("/api/session-fixture");
  const m={exports:{}},routes=[];
  vm.runInNewContext(fs.readFileSync(require.resolve("../../miniprogram/lib/page-lifecycle"),"utf8"),{
    module:m,require:n=>n==="./api"?h.api:{cancel(){}},wx:{reLaunch:o=>routes.push(o.url)},
  });
  const config=m.exports.retain({data:{authorized:false,body:""},onShow(){this.shows=(this.shows||0)+1;}});
  const p={...config,data:{...config.data},setData(patch){Object.assign(this.data,patch);}};
  p.onLoad({});p.onShow();p.setData({authorized:true,body:"unsaved private draft",photos:["cover"]});
  p.onHide();p.onShow();assert.equal(p.data.authorized,true);assert.equal(p.data.body,"unsaved private draft");
  h.api.clear();assert.equal(p.data.authorized,false);assert.equal(p.data.body,"");assert.equal(p.data.photos,null);
  p.setData({authorized:true,body:"late result"});assert.equal(p.data.body,"");
  p.onShow();assert.equal(routes[0],"/pages/login/index");
  p.onUnload();assert.equal(p._gone,true);
});
test("share artwork waits until after transition and hiding cancels background canvas work", () => {
  const m={exports:{}},timers=new Map();let id=0,draws=0;
  vm.runInNewContext(fs.readFileSync(require.resolve("../../miniprogram/lib/sharing"),"utf8"),{
    module:m,setTimeout:(f,ms)=>{assert.equal(ms,450);const next=++id;timers.set(next,()=>{timers.delete(next);f();});return next;},clearTimeout:i=>timers.delete(i),
  });
  const sharing=m.exports,p={data:{},route:"pages/library/index",selectComponent:()=>({render:()=>{draws++;return Promise.resolve("card");}})};
  sharing.schedule(p);assert.equal(draws,0);sharing.cancel(p);assert.equal(timers.size,0);
  sharing.schedule(p);timers.values().next().value();assert.equal(draws,1);
  p._visible=false;sharing.schedule(p);assert.equal(timers.size,0);
});
test("already-cached movie covers use the smaller listing variant and external hosts stay untouched", () => {
  const {coverThumbnail}=require("../../miniprogram/lib/poster-url"),{baseUrl}=require("../../miniprogram/config");
  assert.equal(coverThumbnail(baseUrl+"/media/tmdb/w500/cover.jpg"),baseUrl+"/media/tmdb/w342/cover.jpg");
  assert.equal(coverThumbnail("https://other.example/media/tmdb/w500/cover.jpg"),"https://other.example/media/tmdb/w500/cover.jpg");
});
test("native modules resolve as JavaScript and custom components are declared only where used", () => {
  const path=require("node:path"),root=path.resolve(__dirname,"../../miniprogram");
  function files(dir) {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==="miniprogram_npm"?[]:e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
  for(const file of files(root).filter(f=>f.endsWith(".js"))) {
    for(const [,dependency] of fs.readFileSync(file,"utf8").matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
      const resolved=path.resolve(path.dirname(file),dependency);
      assert.ok(fs.existsSync(resolved.endsWith(".js")?resolved:resolved+".js"),file+": "+dependency);
    }
  }
  const app=JSON.parse(fs.readFileSync(root+"/app.json"));
  assert.equal(Object.keys(app.usingComponents||{}).length,0);
  function markup(file){const text=fs.readFileSync(file,"utf8");return text+Array.from(text.matchAll(/<(?:include|import)\s+src="([^"]+)"/g),m=>markup(path.resolve(path.dirname(file),m[1]))).join("");}
  for(const page of app.pages) {
    const text=markup(root+"/"+page+".wxml"), config=JSON.parse(fs.readFileSync(root+"/"+page+".json"));
    for(const [,tag] of text.matchAll(/<(option-picker|month-picker|mp-cell|mp-cells|share-card)[\s/>]/g))
      assert.ok(config.usingComponents?.[tag],page+": "+tag);
  }
});
