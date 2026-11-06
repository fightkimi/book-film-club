const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function setup(name, read, write = async () => ({})) {
  const routes = [],
    calls = [];
  let signed = true,
    page;
  const wx = {
    reLaunch: (o) => routes.push(o.url),
    navigateTo: (o) => routes.push(o.url),
    redirectTo: (o) => routes.push(o.url),
    switchTab: (o) => routes.push(o.url),
    showToast() {},
    setNavigationBarTitle() {},
  };
  let lib = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../../miniprogram/lib/bookstore-api"),
      "utf8",
    ),
    {
      module: lib,
      wx,
      require: () => ({ hasSession: () => signed }),
    },
  );
  const store = {
    id: "duben",
    name: "讀本屋",
    city: "成都",
    address: "斌升街",
    photos: [],
  };
  const helpers = {
    task: lib.exports.task,
    directory: async () => [store],
    fetchBookstore: read,
    writeBookstore: async (op, payload) => {
      calls.push({ op, payload });
      return write(op, payload);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../../miniprogram/pages/" + name + "/index"),
      "utf8",
    ),
    {
      Page: (c) => (page = c),
      wx,
      require: (n) =>
        n.endsWith("/gatherings")
          ? {
              valid: (id) =>
                typeof id === "string" && /^[0-9a-f]{24}$/.test(id),
            }
          : helpers,
    },
  );
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = (d) => Object.assign(page.data, d);
  return {
    page,
    store,
    calls,
    routes,
    signOut() {
      signed = false;
    },
  };
}

test("new bookstore pages redirect logged-out readers before fetching or showing content", async () => {
  for (const name of [
    "bookstore-following",
    "bookstore-recommend",
    "bookstore-gathering-success",
  ]) {
    const s = setup(name, () => assert.fail("must not read before login"));
    s.page.onLoad?.({});
    s.signOut();
    await s.page.load();
    assert.equal(s.page.data.authorized, false);
    assert.deepEqual(s.routes, ["/pages/login/index?next=tree"]);
  }
});

test("recommendation keeps the draft on failure and publishes once under duplicate taps", async () => {
  let fail = true;
  const s = setup(
    "bookstore-recommend",
    async () => ({
      books: [{ id: "work:one", title: "书名", creator: "作者" }],
      partial: false,
    }),
    async () => {
      if (fail) throw new Error("暂时断线");
      return { id: 42 };
    },
  );
  s.page.onLoad({ shop: "duben" });
  await s.page.load();
  s.page.edit({ detail: { value: "我的推荐理由" } });
  await s.page.publish();
  assert.equal(s.page.data.body, "我的推荐理由");
  const req = s.calls[0].payload.request_id;
  fail = false;
  await Promise.all([s.page.publish(), s.page.publish()]);
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].payload.request_id, req);
  assert.equal(s.calls[1].payload.book_id, "work:one");
  assert.equal(s.calls[1].payload.city, "成都");
  assert.equal(s.page.data.body, "");
  assert.equal(s.routes.at(-1), "/pages/bookstores/index");
  s.page.onHide();
  assert.equal(s.page.data.authorized, false);
});

test("following pagination appends updates and removing the final store returns the empty state", async () => {
  let followed = true;
  const s = setup(
    "bookstore-following",
    async (_op, q) => ({
      stores: followed ? [{ id: "duben" }] : [],
      updates: followed
        ? [
            {
              cursor: q.before ? "second" : "first",
              id: q.before ? 2 : 1,
              type: "post",
              shop: "duben",
              kind: "一句话荐书",
            },
          ]
        : [],
      next: followed && !q.before ? "cursor" : "",
    }),
    async () => {
      followed = false;
      return { following: false };
    },
  );
  await s.page.load();
  assert.equal(s.page.data.loaded, true);
  await s.page.next();
  assert.equal(s.page.data.updates.length, 2);
  assert.equal(s.page.data.updates[1].url, "/pages/bookstore-topic/index?id=2");
  await s.page.unfollow({ currentTarget: { dataset: { id: "duben" } } });
  assert.equal(s.page.data.stores.length, 0);
  assert.equal(s.page.data.updates.length, 0);
});

test("repeat invitation resets date, copies only editable fields and posts a new request", async () => {
  const source = "0123456789abcdef01234567";
  let s;
  s = setup(
    "bookstore-gathering-edit",
    async (op) =>
      op === "shop"
        ? { manage: true, event_ai_ready: false, store: s.store }
        : {
            id: source,
            shop: "duben",
            can_manage: true,
            kind: "meet",
            state: "ended",
            title: "原活动",
            description: "一起读书",
            blurb: "来坐坐",
            place: "一楼",
            capacity: 12,
            starts: "2020-01-01 15:30",
            audience: "circle",
            rev: 8,
            roster: ["私人姓名"],
            recap: "旧回顾",
            my_note: "旧留言",
          },
    async () => ({ id: "abcdef0123456789abcdef01" }),
  );
  s.page.onLoad({ shop: "duben", repeat: source });
  await s.page.load();
  assert.equal(s.page.data.repeating, true);
  assert.equal(s.page.data.editing, false);
  assert.notEqual(s.page.data.date, "2020-01-01");
  assert.equal(s.page.data.time, "15:30");
  assert.equal(s.page.data.audience, "circle");
  assert.equal(s.page.data.roster, undefined);
  assert.equal(s.page.data.recap, undefined);
  assert.equal(s.page.data.my_note, undefined);
  await s.page.save();
  assert.equal(s.calls[0].op, "gather-repeat");
  assert.equal(s.calls[0].payload.source, source);
  assert.equal(s.calls[0].payload.source_rev, 8);
  assert.match(
    s.routes[0],
    /^\/pages\/bookstore-gathering-success\/index\?id=/,
  );
  assert.match(s.routes[0], /&circle=1$/);
});
