const C = require("../../lib/page");
const D = require("../../lib/data");

const { libraryTopics } = require("../../lib/library-topics");

const PAGE_SIZE = 20;
const types = [
  { kind: "", name: "全部" },
  { kind: "book", name: "书籍" },
  { kind: "movie", name: "电影" },
];
const shelves = ["全部状态", "想读 / 想看", "进行中", "已完成", "待补全或核对"];

C.define({
  data: {
    query: "",
    kind: "",
    shelfIndex: 0,
    types,
    shelves,
    loaded: false,
    topicIndex: 0,
    topicOptions: [],
  },
  ready() {
    const previous = this.data.topicOptions[this.data.topicIndex]?.key;
    const topics = libraryTopics(C.api.get().state);
    this.topicGroups = topics.groups;
    const topicIndex = Math.max(
      0,
      topics.options.findIndex((o) => o.key === previous),
    );
    this.setData({ topicOptions: topics.options, topicIndex });
    this.filter(true);
  },
  topic(e) {
    this.setData({ topicIndex: Number(e.detail.value) });
    this.filter();
  },
  search(e) {
    this.setData({ query: e.detail.value });
    this.filter();
  },
  kind(e) {
    this.setData({ kind: e.currentTarget.dataset.kind });
    this.filter();
  },
  shelf(e) {
    this.setData({ shelfIndex: Number(e.detail.value) });
    this.filter();
  },
  filter(keepPage = false) {
    const snapshot = C.api.get();
    if (!snapshot) return;
    const { state, user } = snapshot;
    const { query, kind, shelfIndex } = this.data;
    const shelf = ["", "wish", "reading", "done", "pending"][shelfIndex];
    const selected = new Set(
      state.shelves
        .filter((s) => s.user_id === user.id && s.status === shelf)
        .map((s) => s.work_id),
    );
    const topicKey = this.data.topicOptions[this.data.topicIndex]?.key;
    const topicIds = this.topicGroups?.get(topicKey)?.ids;
    const matches = D.filterWorks(state.works, "", query).filter(
      (w) =>
        (!topicIds || topicIds.has(w.id)) &&
        (!shelf || (shelf === "pending" ? !w.complete : selected.has(w.id))),
    );
    const books = matches.filter((w) => w.kind === "book").reverse();
    const movies = matches.filter((w) => w.kind === "movie").reverse();
    const counts = {
      "": matches.length,
      book: books.length,
      movie: movies.length,
    };
    let visible;
    if (kind) {
      visible = kind === "book" ? books : movies;
    } else {
      visible = [];
      for (
        let index = 0;
        index < Math.max(books.length, movies.length);
        index++
      ) {
        if (books[index]) visible.push(books[index]);
        if (movies[index]) visible.push(movies[index]);
      }
    }
    this.rows = visible.map(
      ({ id, title, creator, year, coverUrl, kindLabel, metadataHint }) => ({
        id,
        title,
        creator,
        year: String(year || "").slice(0, 4),
        image: coverUrl,
        kindLabel,
        metadataHint,
      }),
    );
    this.setData({
      loaded: true,
      works: this.rows.slice(
        0,
        keepPage
          ? Math.max(PAGE_SIZE, this.data.works?.length || 0)
          : PAGE_SIZE,
      ),
      matchCount: this.rows.length,
      types: types.map((t) => ({ ...t, count: counts[t.kind] })),
    });
  },
  onReachBottom() {
    const start = this.data.works?.length || 0;
    if (!this.rows || start >= this.rows.length) return;
    const update = {};
    this.rows.slice(start, start + PAGE_SIZE).forEach((row, offset) => {
      update["works[" + (start + offset) + "]"] = row;
    });
    this.setData(update);
  },
  add() {
    C.go("metadata", this.data.kind ? { kind: this.data.kind } : {});
  },
});
