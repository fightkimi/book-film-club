const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const { merge } = require("../../miniprogram/lib/participation");
function sharing(wx = {}) {
  const ctx = { module: { exports: {} }, wx };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../../miniprogram/lib/sharing"), "utf8"),
    ctx,
  );
  return ctx.module.exports;
}
test("my participation combines source IDs without collisions and excludes other group members", () => {
  const state = {
    group: "小组",
    cycles: [
      {
        id: "same",
        title: "小组共读",
        start: "2026-11-12",
        end: "2026-11-20",
        status: "active",
        participants: { me: { status: "joined" } },
      },
      {
        id: "notmine",
        title: "其他人的活动",
        start: "2026-11-12",
        end: "2026-11-20",
        status: "active",
        participants: { other: { status: "joined" } },
      },
      {
        id: "ongoing",
        title: "正在读",
        start: "2026-11-01",
        end: "2026-11-10",
        status: "active",
        participants: { me: { status: "joined" } },
      },
      {
        id: "left",
        title: "不参加",
        start: "2026-11-12",
        end: "2026-11-20",
        status: "active",
        participants: { me: { status: "opted_out" } },
      },
    ],
  };
  const events = [
    {
      id: "same",
      title: "书店邀约",
      starts: "2026-11-08 12:00",
      state: "open",
      audience: "circle",
      shop_name: "店",
    },
    {
      id: "cancelled",
      title: "取消场次",
      starts: "2026-11-09 12:00",
      state: "cancelled",
      audience: "readers",
      shop_name: "店",
    },
    { id: "deleted", state: "deleted" },
  ];
  const rows = merge(state, { id: "me" }, events, "2026-11-06T00:00:00Z");
  assert.deepEqual(
    rows.slice(0, 3).map((r) => r.key),
    ["store:same", "club:same", "club:ongoing"],
  );
  assert.equal(rows.length, 5);
  assert.match(rows[0].url, /circle=1$/);
  assert.equal(rows.find((r) => r.id === "cancelled").status, "已取消");
  assert.ok(rows.find((r) => r.id === "left").bucket === "past");
});
test("share destinations allow only display routes and strip credentials or management parameters", () => {
  const S = sharing();
  assert.equal(S.validate("https://example.com"), "");
  assert.equal(S.validate("/pages/personal-item/index?id=private"), "");
  assert.equal(
    S.validate("/pages/bookstore/index?id=duben&view=manage&key=secret"),
    "/pages/bookstore/index?id=duben",
  );
  assert.equal(S.validate("/pages/work/index?id=%ZZ"), "");
  assert.equal(
    S.validate("/pages/work/index?weread_id=book1&book_source=weread"),
    "/pages/work/index?weread_id=book1",
  );
});
test("share cards never capture private drafts, circle text, spoilers, or roster data", () => {
  const S = sharing();
  const privatePage = {
    route: "pages/personal-item/index",
    data: { reflection: "绝对私密", aiDraft: "私密草稿" },
  };
  assert.doesNotMatch(
    JSON.stringify(S.describe(privatePage)),
    /绝对私密|私密草稿/,
  );
  const topic = {
    route: "pages/bookstore-topic/index",
    id: "12",
    data: {
      post: {
        scope: "city",
        title: "公开标题",
        kind: "书评",
        body: "结局秘密",
        spoiler: true,
      },
    },
  };
  assert.doesNotMatch(JSON.stringify(S.describe(topic)), /结局秘密/);
  topic.data.post.scope = "circle";
  topic.data.post.title = "圈内标题";
  assert.doesNotMatch(JSON.stringify(S.describe(topic)), /圈内标题|结局秘密/);
  assert.match(S.describe(topic).destination, /id=12/);
  const event = {
    route: "pages/bookstore-gathering/index",
    id: "abc",
    data: {
      v: {
        audience: "circle",
        title: "内部邀约",
        place: "私密住址",
        roster: ["私密名字"],
        state: "open",
      },
    },
  };
  assert.doesNotMatch(
    JSON.stringify(S.describe(event)),
    /内部邀约|私密住址|私密名字/,
  );
  assert.match(S.describe(event).path, /circle=1/);
});
test("shared work resumes only after successful member login, without repeating login for an existing session", async () => {
  const routes = [];
  let allowed = false,
    page;
  const wx = {
    redirectTo: (r) => routes.push(r.url),
    switchTab: (r) => routes.push(r.url),
  };
  const S = sharing(wx);
  const api = {
    hasSession: () => allowed,
    async loginWithWeChat() {
      if (!allowed) throw new Error("未登录");
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../../miniprogram/pages/login/index"),
      "utf8",
    ),
    {
      Page: (x) => (page = x),
      wx,
      require: (n) =>
        n.endsWith("/sharing") ? S : n.endsWith("/api") ? api : {},
    },
  );
  page.setData = (x) => Object.assign(page.data, x);
  page.onLoad({ target: "/pages/work/index?id=book1" });
  page.onShow();
  assert.equal(routes.length, 0);
  await page.submit({ currentTarget: { dataset: {} } });
  assert.equal(routes.length, 0);
  allowed = true;
  await page.submit({ currentTarget: { dataset: {} } });
  assert.deepEqual(routes, ["/pages/work/index?id=book1"]);
  page.onShow();
  assert.equal(routes.length, 2);
});
test("a rendered card replaces the fixed fallback and stale renders cannot replace the current card", async () => {
  const S = sharing();
  let resolves = [];
  const page = {
    route: "pages/work/index",
    query: { id: "a" },
    data: { work: { kind: "book", title: "书一", creator: "作者" } },
    selectComponent: () => ({
      render: () => new Promise((r) => resolves.push(r)),
    }),
  };
  const one = S.message.call(page);
  assert.match(one.path, /target=/);
  assert.ok(one.imageUrl);
  page.data.work.title = "书二";
  const two = S.message.call(page);
  resolves[1]("new.jpg");
  await two.promise;
  resolves[0]("old.jpg");
  await one.promise;
  assert.equal(page._shareImage, "new.jpg");
  const final = S.message.call(page);
  assert.equal(final.imageUrl, "new.jpg");
});

test("public catalog and WeRead book shares resolve public introductions without a private shelf query", () => {
  const S = sharing();
  let page = {
    route: "pages/work/index",
    query: { book_source: "catalog", book_id: "work:b1" },
    data: { work: { kind: "book", title: "书", provider: "manual" } },
  };
  assert.equal(S.describe(page).destination, "/pages/work/index?id=b1");
  page.query = { book_source: "weread", book_id: "publicBook" };
  page.data.work.provider = "weread";
  assert.equal(
    S.describe(page).destination,
    "/pages/work/index?weread_id=publicBook",
  );
  page.data.work.personalUpload = true;
  assert.equal(S.describe(page).model.type, "app");
});

test("native card export draws an image on a 2x Canvas and exports the complete 5:4 frame", async () => {
  let config, exported;
  const drawings = [];
  const context = {
    scale: (...a) => drawings.push(["scale", ...a]),
    fillRect() {},
    fillText() {},
    measureText: (t) => ({ width: t.length * 16 }),
    drawImage: (...a) => drawings.push(["image", ...a]),
  };
  const canvas = {
    getContext: () => context,
    createImage() {
      return {
        width: 100,
        height: 200,
        set src(value) {
          Promise.resolve().then(() => this.onload());
        },
      };
    },
  };
  const selector = {
    select() {
      return this;
    },
    fields() {
      return this;
    },
    exec(fn) {
      fn([{ node: canvas }]);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../../miniprogram/components/share-card/index"),
      "utf8",
    ),
    {
      Component: (c) => (config = c),
      require: () => require("../../miniprogram/lib/share-card-paint"),
      setTimeout,
      clearTimeout,
      wx: {
        canvasToTempFilePath(options) {
          exported = options;
          options.success({ tempFilePath: "card.jpg" });
        },
      },
    },
  );
  const instance = { ...config.methods, createSelectorQuery: () => selector };
  assert.equal(
    await instance.render({
      type: "work",
      kind: "book",
      title: "原书标题",
      cover: "https://example.com/cover.jpg",
    }),
    "card.jpg",
  );
  assert.deepEqual(drawings[0], ["scale", 2, 2]);
  assert.equal(drawings.filter((x) => x[0] === "image").length, 1);
  assert.equal(canvas.width, 1200);
  assert.equal(canvas.height, 960);
  assert.equal(exported.width, 1200);
  assert.equal(exported.height, 960);
  assert.equal(exported.canvas, canvas);
});
