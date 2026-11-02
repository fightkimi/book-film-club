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
  assert.equal(app.tabBar.list.length, 4);
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
          { input() {}, toggle() {}, open() {}, clearError() {} },
          c,
        );
      },
    };
    vm.runInNewContext(js, {
      require: (name) =>
        name.includes("/page")
          ? common
          : name.includes("/data")
            ? D
            : name.includes("posters")
              ? []
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
