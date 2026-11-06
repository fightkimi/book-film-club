const test = require("node:test");
const assert = require("node:assert/strict");
const { createClient, normalizeBase } = require("../../miniprogram/lib/api");
const D = require("../../miniprogram/lib/data");
function runtime(handler) {
  return {
    getSystemInfoSync: () => ({ platform: "devtools" }),
    login: (options) => options.success({ code: "wx-code-fixture" }),
    request: handler,
  };
}
test("only devtools can use loopback HTTP; production requires a domain", () => {
  assert.equal(
    normalizeBase("http://127.0.0.1:8787", "devtools"),
    "http://127.0.0.1:8787",
  );
  for (const url of [
    "http://127.0.0.1:8787",
    "https://192.144.142.118",
    "https://user:secret@example.com",
    "https://example.com/api",
    "http://example.com",
  ])
    assert.throws(() => normalizeBase(url, "ios"));
  assert.equal(
    normalizeBase("https://club.example.com/", "ios"),
    "https://club.example.com",
  );
});
test("wx.request maintains a session only in memory and uses revision for mutations", async () => {
  const calls = [];
  let rev = 3;
  const client = createClient(
    runtime((options) => {
      calls.push(options);
      const path = options.url.split("/api/")[1];
      let data = {};
      let header = {};
      if (path === "wechat/login")
        header = {
          "Set-Cookie":
            "club_session=test-session; Path=/; HttpOnly; SameSite=Strict",
        };
      if (path === "state")
        data = { revision: rev, state: {}, user: { id: "me" } };
      if (path === "action") {
        assert.equal(options.data.revision, 3);
        data = { revision: ++rev, state: {}, result: { id: "saved" } };
      }
      if (path === "logout")
        header = { "set-cookie": "club_session=; Max-Age=0" };
      options.success({ statusCode: 200, data, header });
    }),
    { baseUrl: "http://127.0.0.1:8787" },
  );
  await client.loginWithWeChat("invite-fixture");
  assert.deepEqual(calls[0].data, {
    code: "wx-code-fixture",
    invite: "invite-fixture",
  });
  assert.equal(client.hasSession(), true);
  assert.equal(calls[1].header.Cookie, "club_session=test-session");
  await client.action("shelf.save", { work_id: "work", status: "wish" });
  assert.equal(client.get().revision, 4);
  await client.logout();
  assert.equal(client.hasSession(), false);
  assert.equal(client.get(), null);
  assert.equal(calls[0].header["X-Club-Request"], "1");
});
test("401 drops local session; a version conflict refreshes and never retries mutation", async () => {
  let count = 0,
    mutation = 0;
  const client = createClient(
    runtime((o) => {
      const path = o.url.split("/api/")[1];
      if (path === "wechat/login")
        return o.success({
          statusCode: 200,
          data: {},
          cookies: ["club_session=fixture"],
        });
      if (path === "state")
        return o.success({
          statusCode: 200,
          data: { revision: ++count, state: {} },
        });
      if (path === "action") {
        mutation++;
        return o.success({ statusCode: 409, data: { error: "conflict" } });
      }
      o.success({ statusCode: 401, data: { error: "expired" } });
    }),
    { baseUrl: "http://localhost:8787" },
  );
  await client.loginWithWeChat();
  await assert.rejects(client.action("test", {}), /conflict/);
  assert.equal(mutation, 1);
  assert.equal(client.get().revision, 2);
  await assert.rejects(client.request("/api/private"), /expired/);
  assert.equal(client.hasSession(), false);
});
test("local search includes Chinese alternative film titles and respects type", () => {
  const movies = [
    {
      id: "a",
      title: "English",
      creator: "A",
      kind: "movie",
      extra: { aliases: ["中文译名"] },
    },
    { id: "b", title: "中文译名", creator: "B", kind: "book" },
  ];
  assert.deepEqual(
    D.filterWorks(movies, "movie", "中文译名").map((w) => w.id),
    ["a"],
  );
});
test("all declared pages and handlers exist, and there is no web-view or persistent credential storage", () => {
  const fs = require("node:fs"),
    vm = require("node:vm"),
    path = require("node:path");
  const root = path.resolve(__dirname, "../../miniprogram");
  const app = JSON.parse(fs.readFileSync(path.join(root, "app.json")));
  assert.deepEqual(app.tabBar.list.map((tab) => tab.text), ["活动", "书影", "树洞", "我的"]);
  assert.ok(app.pages.length >= 20);
  for (const page of app.pages) {
    for (const ext of ["js", "json", "wxml", "wxss"])
      assert.ok(
        fs.existsSync(path.join(root, page + "." + ext)),
        page + "." + ext,
      );
    const js = fs.readFileSync(path.join(root, page + ".js"), "utf8"),
      wxml = fs.readFileSync(path.join(root, page + ".wxml"), "utf8");
    let config;
    const common = {
      api: {},
      define: (c) => {
        config = Object.assign(
          { input() {}, toggle() {}, open() {}, clearError() {}, onPullDownRefresh() {} },
          c,
        );
      },
    };
    vm.runInNewContext(js, {
      require: (name) =>
        name.endsWith("/theme-browser") ? require("../../miniprogram/lib/theme-browser") : name.endsWith("/bookstore-feed") ? require("../../miniprogram/lib/bookstore-feed") :
        name.endsWith("/personal-api") ? {...common,currentMonth:()=>"2026-11",today:()=>"2026-11-05"} : name.includes("/page")
          ? common
          : name.includes("/data")
            ? D
            : name.endsWith("/covers")
              ? require("../../miniprogram/lib/covers")
              : {},
      Page: (c) => {
        config = c;
      },
      getApp: () => ({ globalData: {} }),
      wx: {},
      setTimeout,
      clearTimeout,
    });
    for (const match of wxml.matchAll(
      /(?:bind|catch)(?:tap|input|change|confirm|clear)="([A-Za-z]\w*)"/g,
    ))
      assert.equal(
        typeof config[match[1]],
        "function",
        page + " handler " + match[1],
      );
    assert.doesNotMatch(wxml, /<web-view|PASSWORD_vm4/);
    assert.doesNotMatch(js, /setStorageSync\([^)]*(credential|cookie|token)/i);
  }
});

test("tourist preview cannot impersonate a WeChat member", async () => {
  const wx = runtime(() => assert.fail("must not send a login request"));
  wx.getAccountInfoSync = () => ({ miniProgram: { appId: "touristappid" } });
  const client = createClient(wx, { baseUrl: "http://127.0.0.1:8787" });
  await assert.rejects(client.loginWithWeChat(), /游客预览/);
  assert.equal(client.hasSession(), false);
});

test("theme art uses versioned same-origin assets and a cycle resolves art from its own snapshots", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const {
    catalog,
    themePoster,
    activityCover,
  } = require("../../miniprogram/lib/covers");
  const { baseUrl } = require("../../miniprogram/config");
  const config = require("../../project.config.json");
  for (const p of catalog) {
    assert.equal(themePoster({ title: p.theme }), p);
    const remote = new URL(p.image);
    assert.equal(remote.origin, new URL(baseUrl).origin);
    assert.equal(remote.pathname, `/mini-assets/v161/v163/themes/${p.id}.jpg`);
    const source = `assets/themes/${p.id}.jpg`;
    assert.ok(
      config.packOptions.ignore.some(
        (entry) => entry.type === "file" && entry.value === source,
      ),
    );
    const art = fs.readFileSync(
      path.join(__dirname, "../../miniprogram", source),
    );
    assert.equal(art.readUInt16BE(0), 0xffd8);
    assert.ok(art.length < 50 * 1024);
  }
  const movie = { title: "本期电影", image: "https://example.com/film.jpg" };
  const theme = { title: "改过名的主题", poster_key: catalog[1].id };
  assert.equal(activityCover(theme, [movie]).image, catalog[1].image);
  assert.equal(
    D.cycleView({ theme, works: [movie] }).cover.image,
    catalog[1].image,
  );
  assert.equal(
    activityCover({ title: catalog[0].theme, poster_key: "none" }, [
      { image: "" },
      movie,
    ]).image,
    movie.image,
  );
  assert.equal(activityCover({ title: "新主题" }, []).image, "");
  assert.equal(
    activityCover({}, [{ image: "http://example.com/plain.jpg" }]).image,
    "",
  );
});

test("custom navigation has the same four routes and labels as WeChat tab switching", () => {
  const fs = require("node:fs"),
    vm = require("node:vm"),
    path = require("node:path");
  const root = path.resolve(__dirname, "../../miniprogram");
  const app = JSON.parse(fs.readFileSync(path.join(root, "app.json")));
  let nav;
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "custom-tab-bar/index.js"), "utf8"),
    {
      Component(definition) {
        nav = definition;
      },
    },
  );
  assert.equal(app.tabBar.custom, true);
  assert.equal(
    JSON.stringify(nav.data.tabs),
    JSON.stringify(
      app.tabBar.list.map((t) => ({ page: t.pagePath, label: t.text })),
    ),
  );
  const bar = {
    data: { current: "" },
    setData(next) {
      Object.assign(this.data, next);
    },
  };
  for (const tab of app.tabBar.list) {
    nav.methods.selectPage.call(bar, tab.pagePath);
    assert.equal(bar.data.current, tab.pagePath);
  }
});

test("work cards distinguish missing metadata from a complete record awaiting review", () => {
  const book = {
    kind: "book",
    title: "原书名",
    creator: "作者",
    image: "https://example.org/cover.jpg",
    source_url: "https://example.org/books/1",
    metadata_status: "pending",
  };
  assert.equal(D.workView(book).metadataHint, "缺简介");
  const full = { ...book, description: "简介" };
  assert.equal(D.workView(full).metadataHint, "待核对");
  assert.equal(
    D.workView({ ...full, metadata_status: "confirmed" }).metadataHint,
    "",
  );
  assert.equal(
    D.workView({ ...full, creator: "", kind: "movie" }).metadataHint,
    "缺导演",
  );
});

test("library mixes both media and counts and filters the real collection", async () => {
  const fs = require("node:fs"),
    vm = require("node:vm");
  const data = [
    { id: "b1", title: "书一", kind: "book" },
    { id: "b2", title: "书二", kind: "book" },
    { id: "m1", title: "电影", kind: "movie", description:"来源中已有的电影简介。", extra:{runtime:103} },
  ];
  let config;
  const common = {
    api: {
      groupBooks: async () => ({unavailable:[], books:[...data.filter(w=>w.kind==="book").map(w=>({id:w.id, workId:w.id})), {id:"external",title:"另一位的书",author:"作者"}]}),
      get: () => ({ state: { works: data, shelves: [] }, user: { id: "me" } }),
    },
    define: (page) => {
      config = page;
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../../miniprogram/pages/catalog/index"),
      "utf8",
    ),
    {
      require: (name) =>
        name.endsWith("/page")
          ? common
          : name.endsWith("/library-topics")
            ? require("../../miniprogram/lib/library-topics")
            : name.endsWith("/poster-url") ? require("../../miniprogram/lib/poster-url") : D,
    },
  );
  const page = {
    ...config,
    data: { ...config.data },
    setData(next) {
      Object.assign(this.data, next);
    },
  };
  await page.ready(common.api.get());
  assert.deepEqual(Array.from(page.data.works,w=>w.id), ["shelf:external","b2","b1"]);
  page.kind({currentTarget:{dataset:{kind:""}}});
  assert.deepEqual(
    Array.from(page.data.works, (w) => w.id),
    ["shelf:external", "m1", "b2", "b1"],
  );
  assert.deepEqual(
    Array.from(page.data.types, (t) => t.count),
    [4, 3, 1],
  );
  page.kind({ currentTarget: { dataset: { kind: "movie" } } });
  assert.deepEqual(
    Array.from(page.data.works, (w) => w.id),
    ["m1"],
  );
  assert.equal(page.data.works[0].description,"来源中已有的电影简介。");
  assert.equal(page.data.works[0].runtime,103);
  for (let i = 0; i < 30; i++)
    data.push({ id: "new" + i, title: "新电影" + i, kind: "movie" });
  await page.ready(common.api.get());
  assert.equal(page.data.matchCount, 31);
  assert.equal(page.data.works.length, 20);
  let patch;
  page.setData = (next) => {
    patch = next;
  };
  page.onReachBottom();
  assert.equal(Object.keys(patch).length, 11);
  assert.equal(patch["works[30]"].id, "m1");
});

test("only canonical TMDB poster URLs use the same-origin cache; stored source is preserved", () => {
  const { posterUrl } = require("../../miniprogram/lib/poster-url");
  const base = require("../../miniprogram/config").baseUrl;
  const image = "https://image.tmdb.org/t/p/w500/example.jpg";
  assert.equal(posterUrl(image), base + "/media/tmdb/w342/example.jpg");
  assert.equal(posterUrl(image, "w500"), base + "/media/tmdb/w500/example.jpg");
  assert.equal(D.workView({ image }).image, image);
  for (const other of [
    "https://elsewhere.org/t/p/w500/example.jpg",
    image + "?q=1",
    image.replace("example", "../private"),
  ]) {
    assert.equal(posterUrl(other), other);
  }
});

test("an invited visitor can explicitly use their own binding after a mismatch", async () => {
  const fs = require("node:fs"),
    vm = require("node:vm");
  const attempts = [],
    destinations = [];
  let page;
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../../miniprogram/pages/login/index"),
      "utf8",
    ),
    {
      Page: (config) => {
        page = config;
      },
      require: (name) => name.endsWith("/sharing") ? require("../../miniprogram/lib/sharing") : ({
        async loginWithWeChat(invite) {
          attempts.push(invite);
          if (invite) throw new Error("此微信已绑定其他成员");
        },
      }),
      wx: { switchTab: (options) => destinations.push(options.url) },
    },
  );
  page.setData = (update) => Object.assign(page.data, update);
  page.onLoad({ invite: "member-invite-fixture" });
  await page.submit({ currentTarget: { dataset: {} } });
  assert.equal(page.data.invited, true);
  assert.equal(page.data.error, "此微信已绑定其他成员");
  assert.equal(destinations.length, 0);
  await page.submit({ currentTarget: { dataset: { identity: "existing" } } });
  assert.deepEqual(attempts, ["member-invite-fixture", ""]);
  assert.deepEqual(destinations, ["/pages/activities/index"]);
});

test("page navigation shares fresh state; forced checks use revisions; logout drops shelf cache", async () => {
  let transfers=0, checks=0, shelves=0;
  const client=createClient(runtime(o=>{
    let data={},header={};
    if(o.url.endsWith("/wechat/login")) header["Set-Cookie"]="club_session=fixture; Path=/";
    if(o.url.endsWith("/state")){
      transfers++;data={revision:1,user:{id:"me",role:"member"},state:{works:[]},services:{}};
    } else if(o.url.includes("/state?since=1&viewer=me%3Amember")){
      checks++;data={revision:1,unchanged:true,user:{id:"me",role:"member"},services:{}};
    } else if(o.url.endsWith("/booklists/group")){
      shelves++;data={books:[],unavailable:[]};
    }
    o.success({statusCode:200,data,header});
  }),{baseUrl:"http://localhost:8787"});
  await client.loginWithWeChat();
  for(let i=0;i<5;i++) await client.refresh(false);
  assert.equal(transfers,1);assert.equal(checks,0);
  await Promise.all([client.refresh(true),client.refresh(true)]);
  assert.equal(checks,1);assert.deepEqual(client.get().state.works,[]);
  await Promise.all([client.groupBooks(),client.groupBooks()]);assert.equal(shelves,1);
  await client.logout();await client.loginWithWeChat();await client.groupBooks();
  assert.equal(shelves,2);assert.equal(transfers,2);
});

test("the trial tree entry and a stale session redirect to login before showing content", async () => {
  const fs = require("node:fs"), vm = require("node:vm");
  const api = {hasSession: () => false};
  const destinations = [];
  const ctx = { require: () => api, module: {exports:{}}, wx:{reLaunch: e=>destinations.push(e.url)} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../../miniprogram/lib/bookstore-api"),"utf8"),ctx);
  const page = {data:{}, setData(update){Object.assign(this.data,update)}};
  let reads=0;
  await ctx.module.exports.task(page, async()=>{ reads++; });
  assert.equal(reads,0);
  assert.equal(page.data.authorized,false);
  assert.equal(destinations[0],"/pages/login/index?next=tree");
  api.hasSession=()=>true;
  page.data.authorized=true;
  await ctx.module.exports.task(page, async()=>{throw Object.assign(new Error("expired"),{status:401})});
  assert.equal(page.data.authorized,false);
  assert.equal(destinations.length,2);
  const markup = fs.readFileSync(require.resolve("../../miniprogram/pages/login/index.wxml"),"utf8");
  assert.doesNotMatch(markup,/<navigator|逛书店|成都书店/);
  const home = fs.readFileSync(require.resolve("../../miniprogram/pages/bookstores/index"),"utf8");
  assert.match(home,/forumPage\(true\)/);
});

test("opening a tree QR continues to the tree only after successful WeChat login", async () => {
  const fs=require("node:fs"), vm=require("node:vm"), routes=[];
  let page, allowed=false;
  vm.runInNewContext(fs.readFileSync(require.resolve("../../miniprogram/pages/login/index"),"utf8"),{
    Page(def){page=def}, require:name=>name.endsWith("/sharing")?require("../../miniprogram/lib/sharing"):({async loginWithWeChat(){if(!allowed)throw new Error("拒绝登录")}}),
    wx:{switchTab:({url})=>routes.push(url)}
  });
  page.setData=u=>Object.assign(page.data,u); page.onLoad({scene:"tree"});
  await page.submit({currentTarget:{dataset:{}}});
  assert.deepEqual(routes,[]);
  allowed=true;
  await page.submit({currentTarget:{dataset:{}}});
  assert.deepEqual(routes,["/pages/bookstores/index"]);
});

test("a personal WeChat activity card requires login and returns to that activity", async () => {
  const fs=require("node:fs"), vm=require("node:vm");
  const id="0123456789abcdef01234567", actions=[], routes=[];
  const api={async loginWithWeChat(){actions.push("club")}};
  const events={valid:x=>x===id,async verify(x){actions.push(x)}};
  let page;
  vm.runInNewContext(fs.readFileSync(require.resolve("../../miniprogram/pages/login/index"),"utf8"),{
    Page:p=>{page=p},require:name=>name.endsWith("/sharing")?require("../../miniprogram/lib/sharing"):name.endsWith("gatherings")?events:api,
    wx:{redirectTo:q=>routes.push(q.url),switchTab:q=>routes.push(q.url)}
  });
  page.setData=o=>Object.assign(page.data,o);
  page.onLoad({event:id,circle:"0"});await page.submit({currentTarget:{dataset:{}}});
  assert.deepEqual(actions,[id]);assert.equal(routes[0],"/pages/bookstore-gathering/index?id="+id+"&circle=0");
  page.onLoad({event:id,circle:"1"});await page.submit({currentTarget:{dataset:{}}});
  assert.deepEqual(actions,[id,"club",id]);assert.match(routes[1],/circle=1$/);
});

test("activity intro plays once and settles without a duplicate still or film banner", () => {
  const fs = require("node:fs"), vm = require("node:vm");
  let page; const globalData={};
  vm.runInNewContext(fs.readFileSync(require.resolve("../../miniprogram/pages/activities/index"),"utf8"), {
    getApp:()=>({globalData}),
    require: name => name.endsWith("/theme-browser") ? require("../../miniprogram/lib/theme-browser") : name.endsWith("/page") ? {define:p=>{page=p}} : {cycleView:c=>c},
  });
  const screen = {data:{...page.data},setData(d){Object.assign(this,d);Object.assign(this.data,d)}};
  page.onLoad.call(screen);
  assert.equal(screen.playIntro,true);
  assert.equal(screen.loaded,undefined);
  page.ready.call(screen,{state:{group:"组",cycles:[]},user:{id:"one"}});
  assert.equal(screen.loaded,true);assert.equal(screen.cycles.length,0);
  page.ready.call(screen,{state:{group:"组",cycles:[{id:"past",start:"2026-01-01",participants:{},status:"archived"}]},user:{id:"one"}});
  assert.equal(screen.cycles.length,1);
  assert.equal(screen.playIntro,true);
  page.settleIntro.call(screen);assert.equal(screen.playIntro,false);
  page.onLoad.call(screen);assert.equal(screen.playIntro,false);
  const layout=fs.readFileSync(require.resolve("../../miniprogram/pages/activities/index.wxml"),"utf8");
  assert.match(layout,/class="scene-frame scene-still" style="{{playIntro \? 'display:none' : ''}}"/);
  assert.match(layout,/wx:if="{{playIntro}}"[^>]+club-table\.gif/);
  assert.doesNotMatch(layout,/poets-classroom|film-banner/);
  assert.match(layout,/wx:if="{{loaded && !cycles.length && !error}}" class="empty"/);
});
