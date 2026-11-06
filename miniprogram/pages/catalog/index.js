const C = require("../../lib/page");
const D = require("../../lib/data");
const movies = require("../../lib/movie-catalog");

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
  onLoad(q) {
    if (q.kind === "movie") this.setData({ kind: "movie" });
  },
  async ready(snapshot, force) {
    if (!force && this.catalogRevision === snapshot.revision && Date.now() - (this.catalogLoadedAt || 0) < 30000) return;
    this.catalogState = snapshot.state;
    if (!this.collection) {
      this.collection = snapshot.state.works;
      this.updateTopics();
      this.filter(true);
    }
    const local = new Map(snapshot.state.works.map((w) => [w.id, w]));
    let books = snapshot.state.works.filter((w) => w.kind === "book"),
      movieRows = [],
      classifications = {};
    const render = () => {
      if (this._gone) return;
      this.collection = movies.merge(
        [...snapshot.state.works.filter((w) => w.kind !== "book"), ...books],
        movieRows,
        classifications,
      );
      this.updateTopics();
      this.filter(true);
    };
    await Promise.all([
      C.api
        .groupBooks(force)
        .then((group) => {
          books = group.books.map(
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
          if (!this._gone)
            this.setData({
              groupStatus: group.unavailable.length
                ? "部分成员书架暂未加载，下拉可重试"
                : "",
            });
          render();
        })
        .catch((error) => {
          if (error.status === 401) throw error;
          if (!this._gone)
            this.setData({ groupStatus: "成员书架暂未加载，下拉可重试" });
        }),
      movies
        .load(force)
        .then((result) => {
          movieRows = result.movies;
          classifications = result.classifications || {};
          if (!this._gone) this.setData({ movieStatus: "" });
          render();
        })
        .catch((error) => {
          if (error.status === 401) throw error;
          if (!this._gone)
            this.setData({ movieStatus: "扩展片库暂未加载，下拉可重试" });
        }),
    ]);
    if (!this.data.groupStatus && !this.data.movieStatus) {
      this.catalogRevision = snapshot.revision;
      this.catalogLoadedAt = Date.now();
    }
  },

  updateTopics() {
    const previous = this.data.topicOptions[this.data.topicIndex]?.key;
    const topics = libraryTopics({
      ...this.catalogState,
      works: (this.collection || []).filter(
        (w) => !this.data.kind || w.kind === this.data.kind,
      ),
    });
    this.topicGroups = topics.groups;
    const options = topics.options
      .filter((o) => this.data.kind !== "movie" || !o.key.startsWith("club:"))
      .map((o) => ({
        ...o,
        label: !o.key && this.data.kind === "movie" ? "全部类型" : o.label,
      }));
    if (this.data.kind === "movie") {
      const names = movies.orderGenres(
        options.filter((o) => o.key).map((o) => o.label),
      );
      options.sort(
        (a, b) =>
          (a.key ? names.indexOf(a.label) + 1 : 0) -
          (b.key ? names.indexOf(b.label) + 1 : 0),
      );
    }
    this.setData({
      topicOptions: options,
      topicIndex: Math.max(
        0,
        options.findIndex((o) => o.key === previous),
      ),
    });
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
    this.setData({
      kind: e.currentTarget.dataset.kind,
      topicIndex: 0,
      shelfIndex: 0,
    });
    this.updateTopics();
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
        externalMovie,
        personalUpload,
        source_id,
        browse_genres,
      }) => ({
        id,
        external,
        externalMovie,
        personalUpload,
        source_id,
        categories: (browse_genres || []).join(" · "),
        title,
        creator,
        year: String(year || "").slice(0, 4),
        image: coverThumbnail(coverUrl),
        original: coverUrl,
        kindLabel,
        kind,
        description: description || "",
        runtime: kind === "movie" ? extra?.runtime : null,
        metadataHint: externalMovie ? "" : external ? "成员书架" : metadataHint,
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
    if (row.externalMovie) C.go("work", { movie_id: row.id });
    else if (row.external)
      C.go("work", { book_id: row.id, book_source: "catalog" });
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
