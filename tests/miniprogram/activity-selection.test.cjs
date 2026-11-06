const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const movies=require("../../miniprogram/lib/movie-catalog");
const selection=require("../../miniprogram/lib/activity-works");
function setup() {
  const state={themes:[{id:"t",title:"回应",description:"那些没说出口的话"}],cycles:[],works:[
    ...Array.from({length:25},(_,i)=>({id:"b"+i,kind:"book",title:"书籍"+i,creator:"作者",metadata_status:"confirmed"})),
    {id:"m1",kind:"movie",title:"已有电影",provider:"tmdb",source_id:"1",metadata_status:"confirmed"},
  ]};
  const publicMovies=[1,2,3].map(i=>({id:"tmdb:"+i,kind:"movie",provider:"tmdb",source_id:String(i),title:"电影"+i,creator:"导演",extra:{aliases:i===2?["Musical Alias"]:[]}}));
  let config;
  const calls=[],nav=[],ctx={failImport:false,loseResponse:false,failPicks:false,wrongPreview:false};
  const api={get:()=>({state}),refresh:async()=>({state}),
    async request(path,payload){
      calls.push({path,payload});
      if(path.endsWith("activity-picks-ai")){
        if(ctx.failPicks)throw new Error("timeout");
        return {recommendations:[{...publicMovies[1],externalMovie:true,reason:"从回应的时机聊起",caveat:""}]};
      }
      if(path.endsWith("activity-theme-ai"))return {draft:{theme:{title:"新题",description:"说明",angles:"问题"}}};
      return {token:"verified-preview",item:{...publicMovies[1],source_id:ctx.wrongPreview?"999":payload.source_id}};
    },
    async action(action,payload){
      calls.push({action,payload:structuredClone(payload)});
      if(action==="metadata.import"){
        if(ctx.failImport)throw new Error("import failed");
        const result={...publicMovies[1],id:"canonical-2",externalMovie:false,metadata_status:"confirmed"};state.works.push(result);
        if(ctx.loseResponse)throw new Error("response lost");
        return {result,state};
      }
      return {result:{id:"draft"},state};
    }};
  const C={api,define:c=>config=c,go(){},async run(p,fn){if(p.data.busy)return;p.setData({busy:true,error:""});try{return await fn();}catch(e){p.setData({error:e.message});}finally{p.setData({busy:false});}}};
  vm.runInNewContext(fs.readFileSync(require.resolve("../../miniprogram/pages/cycle-edit/index"),"utf8"),{
    require:n=>n.endsWith("/page")?C:n.endsWith("/movie-catalog")?{...movies,load:async()=>({movies:publicMovies})}:n.endsWith("/activity-works")?selection:{activityCover:()=>null},
    wx:{pageScrollTo(){},showToast(){},redirectTo:o=>nav.push(o)},
  });
  const page={...config,query:{theme_id:"t"},data:structuredClone(config.data),setData(patch){for(const [key,value] of Object.entries(patch)){let target=this.data,parts=key.split(".");while(parts.length>1)target=target[parts.shift()];target[parts[0]]=value;}}};
  page.data.canStartActivity=true;
  return {page,state,api,ctx,calls,nav,async start(){await page.ready({state,users:[{id:"me"}],user:{id:"me",role:"member"}});},kind:i=>page.kind({detail:{value:i}}),check:ids=>page.works({detail:{value:ids}})};
}

test("activity kind filters immediately, mixed includes both media, movie search includes aliases",async()=>{
  const h=setup();await h.start();
  assert.deepEqual(h.page.data.works.slice(0,2).map(w=>w.kindLabel),["书籍","电影"]);
  h.kind(2);assert.equal(h.page.data.workCount,3);assert.ok(h.page.data.works.every(w=>w.kindLabel==="电影"));
  h.page.searchWorks({detail:{value:"musical alias"}});assert.deepEqual([...h.page.data.works.map(w=>w.id)],["tmdb:2"]);
  h.kind(1);assert.equal(h.page.data.workCount,25);assert.ok(h.page.data.works.every(w=>w.kindLabel==="书籍"));
});
test("selection survives search, and changing media removes only incompatible choices",async()=>{
  const h=setup();await h.start();h.check(["b0","m1"]);
  h.page.searchWorks({detail:{value:"书籍2"}});h.check(["b2"]);
  assert.deepEqual([...h.page.data.form.work_ids],["b0","m1","b2"]);
  h.kind(2);assert.deepEqual([...h.page.data.form.work_ids],["m1"]);assert.match(h.page.data.workNotice,/已移除/);
});
test("expanded movie resolves through trusted metadata before next step and save",async()=>{
  const h=setup();await h.start();h.kind(2);h.check(["tmdb:2"]);
  await h.page.nextStep();assert.equal(h.page.data.step,1);
  assert.deepEqual([...h.page.data.form.work_ids],["canonical-2"]);
  assert.deepEqual(h.calls.filter(c=>c.action).map(c=>c.action),["metadata.import"]);
  await h.page.save();await Promise.resolve();
  assert.deepEqual([...h.calls.find(c=>c.action==="cycle.save").payload.work_ids],["canonical-2"]);
  assert.equal(h.page.data.workCount,3);
});
test("failed movie import keeps the chosen work and step, retry and lost responses do not duplicate",async()=>{
  const h=setup();await h.start();h.kind(2);h.check(["tmdb:2"]);h.ctx.failImport=true;
  await h.page.nextStep();assert.equal(h.page.data.step,0);assert.deepEqual([...h.page.data.form.work_ids],["tmdb:2"]);
  h.ctx.failImport=false;h.ctx.loseResponse=true;await h.page.nextStep();
  assert.equal(h.page.data.step,1);assert.equal(h.state.works.filter(w=>w.source_id==="2").length,1);
});
test("mismatched metadata cannot be imported or submitted",async()=>{
  const h=setup();await h.start();h.kind(2);h.check(["tmdb:2"]);h.ctx.wrongPreview=true;
  await h.page.nextStep();assert.equal(h.page.data.step,0);assert.match(h.page.data.error,/不匹配/);
  assert.equal(h.calls.filter(c=>c.action).length,0);
});
test("AI proposes without saving, batch adoption preserves manual choices and type changes clear suggestions",async()=>{
  const h=setup();await h.start();h.kind(2);h.check(["m1"]);await h.page.recommendWorks();
  assert.deepEqual([...h.page.data.form.work_ids],["m1"]);assert.equal(h.calls.filter(c=>c.action).length,0);
  h.page.selectAllRecommended();assert.deepEqual([...h.page.data.form.work_ids],["m1","tmdb:2"]);
  h.ctx.failPicks=true;await h.page.recommendWorks();assert.match(h.page.data.picksError,/timeout/);assert.equal(h.page.data.recommendations.length,1);
  h.kind(1);assert.equal(h.page.data.recommendations.length,0);assert.equal(h.page.data.form.work_ids.length,0);
});
test("adopted AI movie remains checked after canonical import without duplicate rows",async()=>{
  const h=setup();await h.start();h.kind(2);await h.page.recommendWorks();h.page.selectAllRecommended();await h.page.nextStep();
  assert.equal(h.page.data.recommendations[0].id,"canonical-2");assert.equal(h.page.data.recommendations[0].checked,true);
  assert.equal(h.page.data.workCount,3);assert.equal(h.page.data.works.filter(w=>w.id==="tmdb:2").length,0);
});
