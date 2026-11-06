const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const M = require("../../miniprogram/lib/movie-catalog");
const D = require("../../miniprogram/lib/data");
const corpus = require("../../movie_catalog.json");
function pageHarness(
  groupBooks = async () => ({ books: [], unavailable: [] }),
  response = corpus,
) {
  let config;
  const nav = [];
  const state = {
    works: [{ ...corpus.movies[0], id: "local-movie" }],
    themes: [],
    cycles: [],
    shelves: [],
  };
  const C = {
    define: (x) => (config = x),
    go: (name, q) => nav.push({ name, q }),
    api: { get: () => ({ state, user: { id: "me" } }), groupBooks },
  };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../../miniprogram/pages/catalog/index"),
      "utf8",
    ),
    {
      require: (name) =>
        name.endsWith("/page")
          ? C
          : name.endsWith("/movie-catalog")
            ? {
                merge: M.merge,
                orderGenres: M.orderGenres,
                load: async () => response,
              }
            : name.endsWith("/library-topics")
              ? require("../../miniprogram/lib/library-topics")
              : name.endsWith("/poster-url")
                ? require("../../miniprogram/lib/poster-url")
                : D,
    },
  );
  const page = {
    ...config,
    data: structuredClone(config.data),
    setData(value) {
      for (const [key, val] of Object.entries(value)) {
        const m = /^works\[(\d+)\]$/.exec(key);
        if (m) this.data.works[Number(m[1])] = val;
        else this.data[key] = val;
      }
    },
  };
  page.onLoad({ kind: "movie" });
  return { page, nav, state };
}
test("500 distinct films keep local imports, render in batches, and filter by original title and genre", async () => {
  const h = pageHarness();
  await h.page.ready({ state: h.state });
  assert.equal(
    h.page.data.types.find((t) => t.kind === "movie").count,
    corpus.movies.length,
  );
  assert.equal(h.page.data.works.length, 20);
  assert.equal(
    h.page.collection.filter((w) => w.source_id === corpus.movies[0].source_id)
      .length,
    1,
  );
  assert.equal(
    h.page.collection.find((w) => w.source_id === corpus.movies[0].source_id)
      .id,
    "local-movie",
  );
  h.page.onReachBottom();
  assert.equal(h.page.data.works.length, 40);
  h.page.search({ detail: { value: "INTERSTELLAR" } });
  assert.ok(h.page.data.works.some((w) => w.title === "星际穿越"));
  h.page.search({ detail: { value: "诺兰" } });
  assert.ok(h.page.data.works.every((w) => w.creator.includes("诺兰")));
  h.page.search({ detail: { value: "" } });
  const genre = h.page.data.topicOptions.findIndex(
    (o) => o.key === "genre:纪录",
  );
  assert.ok(genre > 0);
  h.page.topic({ detail: { value: genre } });
  assert.equal(h.page.data.matchCount, 50);
  assert.equal(h.page.data.works.length, 20);
  h.page.openBook({ currentTarget: { dataset: { index: 0 } } });
  assert.match(h.nav[0].q.movie_id, /^tmdb:/);
});
test("movie results arrive before an unrelated member-book request finishes", async () => {
  let finish;
  const h = pageHarness(() => new Promise((resolve) => (finish = resolve)));
  const pending = h.page.ready({ state: h.state });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    h.page.data.types.find((t) => t.kind === "movie").count,
    corpus.movies.length,
  );
  finish({ books: [], unavailable: [] });
  await pending;
});
test("an expanded movie share retains the detail target through the login allowlist", () => {
  const S = require("../../miniprogram/lib/sharing");
  const row = corpus.movies[0];
  const result = S.describe({
    route: "pages/work/index",
    query: { movie_id: row.id },
    data: { work: row },
  });
  assert.equal(result.model.type, "work");
  assert.equal(
    S.validate(result.destination),
    "/pages/work/index?movie_id=" + encodeURIComponent(row.id),
  );
});

test("WeChat encoded navigation parameters are decoded exactly once before API lookup", () => {
  const S = require("../../miniprogram/lib/sharing");
  assert.deepEqual(S.decodeQuery({ movie_id: "tmdb%3A10975", kind: "movie" }), {
    movie_id: "tmdb:10975",
    kind: "movie",
  });
  const destination = S.target("work", { movie_id: "tmdb:10975" });
  const raw = S.decodeQuery({ target: encodeURIComponent(destination) });
  assert.equal(S.validate(raw.target), destination);
  assert.equal(S.decodeQuery({ bad: "%ZZ" }).bad, "%ZZ");
  assert.equal(
    S.validate(
      S.decodeQuery({
        target: encodeURIComponent("/pages/personal-item/index?id=private"),
      }).target,
    ),
    "",
  );
});

test("curated browse genres replace secondary source tags in filtering, including old local records", async () => {
  const categories = {
    13: ["剧情"],
    854: ["喜剧", "奇幻"],
    313369: ["音乐与歌舞", "爱情"],
    316029: ["音乐与歌舞"],
  };
  const movies = corpus.movies
    .filter((r) => categories[r.source_id])
    .map((r) => ({ ...r, browse_genres: categories[r.source_id] }));
  const h = pageHarness(undefined, { movies, classifications: categories });
  h.state.works = [
    {
      ...movies.find((r) => r.source_id === "13"),
      id: "local-forrest",
      browse_genres: undefined,
    },
  ];
  await h.page.ready({ state: h.state });
  const music = h.page.data.topicOptions.findIndex(
    (o) => o.key === "genre:音乐与歌舞",
  );
  assert.ok(music > 0);
  h.page.topic({ detail: { value: music } });
  assert.deepEqual(
    new Set(h.page.data.works.map((r) => r.title)),
    new Set(["爱乐之城", "马戏之王"]),
  );
  const love = h.page.data.topicOptions.findIndex(
    (o) => o.key === "genre:爱情",
  );
  h.page.topic({ detail: { value: love } });
  assert.ok(h.page.data.works.some((r) => r.title === "爱乐之城"));
  assert.ok(
    !h.page.data.works.some((r) => ["阿甘正传", "变相怪杰"].includes(r.title)),
  );
  h.page.topic({ detail: { value: 0 } });
  h.page.search({ detail: { value: "爱情" } });
  assert.ok(
    !h.page.data.works.some((r) => ["阿甘正传", "变相怪杰"].includes(r.title)),
  );
});
