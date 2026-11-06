const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { libraryTopics } = require("../../miniprogram/lib/library-topics");

test("club shelves combine chosen works and featured films; genres cross media; unknowns remain browsable", () => {
  const state = {
    themes: [{ id: "a", title: "改过名的主题", poster_key: "rashomon" }],
    works: [
      {
        id: "film",
        kind: "movie",
        title: "罗生门",
        year: "1950",
        tags: "剧情 / 悬疑",
      },
      { id: "book", kind: "book", title: "另一种视角", tags: "悬疑、推理" },
      { id: "not-film", kind: "book", title: "罗生门", year: "1950" },
      { id: "n", kind: "book" },
    ],
    cycles: [
      {
        theme_id: "a",
        theme: { title: "旧名" },
        works: [{ id: "book" }, { id: "work-removed" }],
        nominations: ["n"],
      },
      {
        theme_id: "past",
        theme: { title: "历史主题" },
        works: [{ id: "book" }],
      },
    ],
  };
  const { groups, options } = libraryTopics(state);
  assert.deepEqual([...groups.get("club:a").ids].sort(), ["book", "film"]);
  assert.deepEqual([...groups.get("genre:悬疑").ids].sort(), ["book", "film"]);
  assert.deepEqual([...groups.get("club:past").ids], ["book"]);
  assert.deepEqual([...groups.get("other").ids], ["not-film", "n"]);
  assert.ok(
    options.some(
      (o) =>
        o.label === "改过名的主题" && o.section === "小组主题" && o.count === 2,
    ),
  );
  assert.equal(options[0].key, "");
});

test("draw persists once, even if double-tapped, skipped, hidden, or the animation fails", async () => {
  let config,
    resolveDraw,
    calls = 0,
    activeTimer = 0;
  const clock = new Map();
  const pageApi = {
    define: (options) => {
      config = options;
    },
    run: async (page, fn) => {
      page.setData({ busy: true });
      try {
        return await fn();
      } finally {
        page.setData({ busy: false });
      }
    },
    api: {
      action: () => {
        calls++;
        return new Promise((resolve) => {
          resolveDraw = resolve;
        });
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../../miniprogram/pages/draw/index"),
      "utf8",
    ),
    {
      require: () => pageApi,
      setTimeout: (fn, ms) => {
        clock.set(++activeTimer, { fn, ms });
        return activeTimer;
      },
      clearTimeout: (id) => clock.delete(id),
    },
  );
  const p = {
    ...config,
    data: { ...config.data, isAdmin: false, canDrawTheme: true },
    setData(o) {
      Object.assign(this.data, o);
    },
  };
  const theme = {
    id: "t",
    title: "不可靠的讲述者",
    kind: "mixed",
    enabled: true,
  };
  p.ready({ state: { themes: [theme], cycles: [] } });
  const wait = p.draw();
  p.draw();
  assert.equal(calls, 1);
  resolveDraw({ result: { theme_title: theme.title, theme_id: theme.id } });
  await wait;
  assert.equal(p.data.phase, "drawing");
  p.filmLoaded();
  assert.equal(clock.get(p.timer).ms, 4000);
  p.reveal();
  assert.equal(p.data.phase, "revealed");
  assert.equal(clock.size, 0);
  assert.equal(calls, 1);
  p.filmLoaded();
  assert.equal(clock.size, 0);
  p.adjust();
  p.choose({ currentTarget: { dataset: { field: "modeIndex", index: 1 } } });
  assert.equal(p.data.candidateCount, 0);
  p.draw();
  assert.equal(calls, 1);
  p.choose({ currentTarget: { dataset: { field: "modeIndex", index: 2 } } });
  const again = p.draw();
  p.onHide();
  resolveDraw({ result: { theme_id: "t", theme_title: theme.title } });
  await again;
  assert.equal(p.data.phase, "revealed");
  assert.equal(clock.size, 0);
  p.ready({ state: { themes: [theme], cycles: [] } });
  const third = p.draw();
  resolveDraw({ result: { theme_id: "t", theme_title: theme.title } });
  await third;
  clock.get(p.timer).fn();
  assert.equal(p.data.phase, "revealed");
  assert.equal(calls, 3);
});

test("draw history starts folded, pages beyond the former limit, and collapses without changing records", () => {
  let config;
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../../miniprogram/pages/themes/index"),
      "utf8",
    ),
    {
      require: (name) =>
        name.endsWith("/theme-browser") ? require("../../miniprogram/lib/theme-browser") : name.endsWith("/page")
          ? {
              define(options) {
                config = options;
              },
            }
          : {
              themePoster() {
                return null;
              },
            },
    },
  );
  const p = {
    ...config,
    data: { ...config.data },
    setData(x) {
      Object.assign(this.data, x);
    },
  };
  const draws = Array.from({ length: 27 }, (_, i) => ({
    id: i,
    theme_title: "主题" + i,
    at: "2026-11-03T16:59:09+08:00",
  }));
  const state = { themes: [], cycles: [], draws };
  p.ready({ state });
  assert.equal(p.data.historyTotal, 27);
  assert.equal(p.data.draws.length, 0);
  p.toggleHistory();
  assert.equal(p.data.draws.length, 5);
  assert.equal(p.data.draws[0].id, 26);
  assert.match(p.data.draws[0].time, /11 月 3 日 16:59/);
  for (let i = 0; i < 5; i++) p.moreHistory();
  assert.equal(p.data.draws.length, 27);
  assert.equal(p.data.draws[26].id, 0);
  p.toggleHistory();
  assert.equal(p.data.draws.length, 0);
  p.toggleHistory();
  assert.equal(p.data.draws.length, 5);
  assert.equal(draws[0].id, 0);
});
