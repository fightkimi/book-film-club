const C = require("../../lib/page");
const D = require("../../lib/data");

const { libraryTopics } = require("../../lib/library-topics");
const { coverThumbnail } = require("../../lib/poster-url");

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
    kind: "book",
    shelfIndex: 0,
    types,
    shelves,
    loaded: false,
    topicIndex: 0,
    topicOptions: [],
  },
  async ready(snapshot, force) {
    const previous = this.data.topicOptions[this.data.topicIndex]?.key;
    const topics = libraryTopics(snapshot.state);
    this.topicGroups = topics.groups;
    const topicIndex = Math.max(
      0,
      topics.options.findIndex((o) => o.key === previous),
    );
    this.setData({ topicOptions: topics.options, topicIndex });
    // Render the local catalog immediately; merge the authorized member shelves when ready.
    if (this.lastState !== snapshot.state) {
      this.collection = snapshot.state.works.filter((w) => w.kind === "movie");
      this.setData({ groupStatus: "正在合并成员书架…" });
      this.filter(true);
    }
    let group;
    try {
      group = await C.api.groupBooks(force);
    } catch (error) {
      if (!this._gone) {
        this.collection = snapshot.state.works;
        this.setData({
          groupStatus: "完整书目未加载，暂时显示已入库作品，下拉可重试",
        });
        this.filter(true);
      }
      throw error;
    }
    this.lastState = snapshot.state;
    if (this._gone) return;
    const local = new Map(snapshot.state.works.map((w) => [w.id, w]));
    const books = group.books.map(
      (b) =>
        (b.workId && local.get(b.workId)) || {
          id: "shelf:" + b.id,
          source_id: b.id,
          kind: "book",
          title: b.title,
          creator: b.author,
          image: b.cover,
          external: true,
          personalUpload: b.personalUpload,
        },
    );
    this.collection = [
      ...snapshot.state.works.filter((w) => w.kind !== "book"),
      ...books,
    ];
    this.setData({
      groupStatus: group.unavailable.length
        ? group.unavailable.join("、") + "的书架暂未加载，下拉可重试"
        : "",
    });
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
    const matches = D.filterWorks(
      this.collection || state.works,
      "",
      query,
    ).filter(
      (w) =>
        (!topicIds || topicIds.has(w.id)) &&
        (!shelf ||
          (shelf === "pending"
            ? !w.external && !w.complete
            : selected.has(w.id))),
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
      ({
        id,
        title,
        creator,
        year,
        coverUrl,
        kindLabel,
        kind,
        description,
        extra,
        metadataHint,
        external,
        personalUpload,
        source_id,
      }) => ({
        id,
        external,
        personalUpload,
        source_id,
        title,
        creator,
        year: String(year || "").slice(0, 4),
        image: coverThumbnail(coverUrl),
        original: coverUrl,
        kindLabel,
        kind,
        description: description || "",
        runtime: kind === "movie" ? extra?.runtime : null,
        metadataHint: external ? "成员书架" : metadataHint,
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
  coverError(e) {
    const i = e.currentTarget.dataset.index,
      row = this.rows?.[i];
    if (
      !row ||
      row.id !== e.currentTarget.dataset.id ||
      row.image === row.original
    )
      return;
    row.image = row.original;
    this.setData({ ["works[" + i + "].image"]: row.image });
  },
  openBook(e) {
    const row = this.rows[e.currentTarget.dataset.index];
    if (!row) return;
    if (row.personalUpload)
      return wx.showToast({ title: "个人导入书，仅分享书目", icon: "none" });
    if (row.external) C.go("work", { book_id: row.id, book_source: "catalog" });
    else C.go("work", { id: row.id });
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
