const P = require("../../lib/personal-api");
const { coverThumbnail } = require("../../lib/poster-url");
P.define({
  data: {
    kind: "book",
    source: "weread",
    rows: [],
    query: "",
    selected: null,
    month: P.currentMonth(),
    planned: true,
    title: "",
    creator: "",
    folders: [{ name: "全部电子书", book_ids: null }],
    folderIndex: 0,
    connection: null,
  },
  onLoad(q) {
    this.req = P.requestId();
    this.preset = q.book || "";
    this.setData({
      month: q.month || P.currentMonth(),
      kind: q.kind === "movie" ? "movie" : "book",
      source: q.source || (q.book || q.kind === "movie" ? "catalog" : "weread"),
    });
  },
  async load() {
    await this.sources();
  },
  async sources() {
    if (this.data.source === "manual") {
      this.setData({ rows: [], selected: null });
      return;
    }
    if (this.data.source === "public" && this.preset) {
      const api = require("../../lib/api");
      const r = await api.request("/api/metadata/detail", {
        provider: "weread",
        source_id: this.preset,
      });
      const selected = {
        ...r.item,
        id: this.preset,
        introLoaded: true,
        coverUrl: coverThumbnail(r.item.image || ""),
      };
      this.all = [selected];
      this.setData({ selected, rows: [], connection: null });
      return;
    }
    const r = await P.call("sources", undefined, {
      source: this.data.source,
      kind: this.data.kind,
    });
    this.all = (r.items || []).map((b) => ({
      ...b,
      introLoaded: typeof b.description === "string",
      coverUrl: coverThumbnail(b.image || ""),
      year: String(b.year || "").slice(0, 4),
    }));
    this.setData({
      connection: r.connection || null,
      folders: [
        { name: "全部电子书", book_ids: null },
        ...(r.connection?.folders || []),
      ],
      folderIndex: 0,
      selected:
        this.all.find(
          (b) => b.id === (this.data.selected?.id || this.preset),
        ) || null,
    });
    this.filter();
    if (
      this.data.kind === "book" &&
      this.data.selected &&
      !this.data.selected.description
    )
      await this.loadIntro(this.data.selected);
  },
  filter() {
    const term = this.data.query.trim().toLowerCase();
    const folder = this.data.folders[this.data.folderIndex];
    this.matches = (this.all || []).filter(
      (b) =>
        (!folder?.book_ids || folder.book_ids.includes(b.id)) &&
        (!term || (b.title + " " + b.creator).toLowerCase().includes(term)),
    );
    this.setData({
      rows: this.matches.slice(0, 40),
      count: this.matches.length,
    });
  },
  search(e) {
    this.setData({ query: e.detail.value });
    this.filter();
  },
  folder(e) {
    this.setData({ folderIndex: Number(e.detail.value) });
    this.filter();
  },
  source(e) {
    return P.run(this, async () => {
      this.setData({
        source: e.currentTarget.dataset.source,
        selected: null,
        query: "",
      });
      await this.sources();
    });
  },
  kind(e) {
    return P.run(this, async () => {
      const kind = e.currentTarget.dataset.kind;
      this.setData({
        kind,
        source:
          kind === "movie" && ["weread", "notebooks"].includes(this.data.source)
            ? "catalog"
            : this.data.source,
        selected: null,
        query: "",
      });
      await this.sources();
    });
  },
  syncNotebooks() {
    return P.run(this, async () => {
      await P.call("sync-notebooks", {});
      await this.sources();
    });
  },
  clearSelection() {
    return P.run(this, async () => {
      this.preset = "";
      this.setData({
        selected: null,
        source: this.data.source === "public" ? "catalog" : this.data.source,
      });
      await this.sources();
    });
  },
  choose(e) {
    const selected = this.all.find((b) => b.id === e.currentTarget.dataset.id);
    if (selected?.personalUpload) {
      this.setData({ selected });
      return;
    }
    this.details(e);
  },
  selectForPlan(e) {
    if (this.data.busy) return;
    const selected = this.all?.find((b) => b.id === e.currentTarget.dataset.id);
    if (!selected) {
      this.setData({ error: "书目已更新，请重新选择" });
      return;
    }
    this.preset = "";
    this.setData({ selected, error: "", introError: "" });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  async loadIntro(selected) {
    if (selected.personalUpload) return;
    try {
      const r = await P.call("book-detail", undefined, {
        id: selected.id,
        source: this.data.source,
      });
      const full = {
        ...selected,
        ...r.book,
        introLoaded: true,
        coverUrl: coverThumbnail(r.book.image || selected.image || ""),
        year: String(r.book.year || "").slice(0, 4),
      };
      this.all = this.all.map((b) => (b.id === selected.id ? full : b));
      this.setData({ selected: full });
    } catch (e) {
      if (e.status === 401) throw e;
      this.setData({ introError: "简介暂未加载，可以稍后再查看" });
    }
  },
  details(e) {
    const id = e.currentTarget.dataset.id || this.data.selected?.id;
    if (this.data.source === "catalog" && id?.startsWith("work:"))
      P.go("work", { id: id.slice(5), month: this.data.month });
    else if (id && !this.data.selected?.personalUpload)
      P.go("work", {
        book_id: id,
        book_source: this.data.source,
        month: this.data.month,
      });
  },
  planned(e) {
    this.setData({ planned: e.detail.value });
  },
  month(e) {
    this.setData({ month: e.detail.value.slice(0, 7) });
  },
  onReachBottom() {
    if (this.matches?.length > this.data.rows.length)
      this.setData({ rows: this.matches.slice(0, this.data.rows.length + 40) });
  },
  add() {
    return P.run(this, async () => {
      const d = this.data;
      if (d.source !== "manual" && !d.selected) throw new Error("先选一部作品");
      await P.call("add", {
        source: d.source === "notebooks" ? "weread" : d.source,
        source_id: d.selected?.id || "",
        kind: d.kind,
        title: d.title.trim(),
        creator: d.creator.trim(),
        month: d.planned ? d.month : "",
        request_id: this.req,
      });
      wx.showToast({
        title: d.planned ? "已加入计划" : "已加入",
        icon: "success",
      });
      getApp().globalData.personalLibraryFocus = {
        month: d.month,
        view: d.planned ? "month" : "wish",
        kind: d.kind,
      };
      wx.switchTab({ url: "/pages/library/index" });
    });
  },
});
