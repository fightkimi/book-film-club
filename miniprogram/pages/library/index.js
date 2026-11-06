const P = require("../../lib/personal-api");
P.define({
  data: {
    month: P.currentMonth(),
    view: "month",
    kind: "",
    items: [],
    nextOffset: null,
    connection: null,
    completed: {},
    tabs: [
      { id: "month", label: "本月计划" },
      { id: "wish", label: "想读想看" },
      { id: "done", label: "已读已看" },
    ],
    types: [
      { id: "", label: "全部" },
      { id: "book", label: "书籍" },
      { id: "movie", label: "电影" },
    ],
  },
  async read(more = false) {
    const r = await P.call("list", undefined, {
      month: this.data.month,
      view: this.data.view,
      kind: this.data.kind,
      offset: more ? this.data.nextOffset : 0,
    });
    this.setData({
      ...r,
      monthLabel:
        r.month.slice(0, 4) + " 年 " + Number(r.month.slice(5)) + " 月",
      items: more
        ? this.data.items.concat(r.items.map(P.present))
        : r.items.map(P.present),
      nextOffset: r.next,
    });
  },
  load() {
    const pending = getApp().globalData.personalLibraryFocus;
    if (pending) {
      delete getApp().globalData.personalLibraryFocus;
      if (
        /^\d{4}-\d{2}$/.test(pending.month) &&
        ["month", "wish"].includes(pending.view)
      )
        this.setData({
          month: pending.month,
          view: pending.view,
          kind: pending.kind === "movie" ? "movie" : "book",
        });
    }
    return this.read();
  },
  tab(e) {
    return P.run(this, async () => {
      this.setData({ view: e.currentTarget.dataset.id });
      await this.read();
    });
  },
  kind(e) {
    return P.run(this, async () => {
      this.setData({ kind: e.currentTarget.dataset.id });
      await this.read();
    });
  },
  month(e) {
    return P.run(this, async () => {
      this.setData({ month: e.detail.value.slice(0, 7) });
      await this.read();
    });
  },
  step(e) {
    return P.run(this, async () => {
      const [y, m] = this.data.month.split("-").map(Number);
      const next = new Date(
        Date.UTC(y, m - 1 + Number(e.currentTarget.dataset.step), 1),
      )
        .toISOString()
        .slice(0, 7);
      this.setData({ month: next });
      await this.read();
    });
  },
  add() {
    P.go("personal-add", {
      month: this.data.month,
      kind: this.data.kind || "book",
      source:
        this.data.kind === "movie"
          ? "catalog"
          : this.data.connection?.connected
            ? "weread"
            : "catalog",
    });
  },
  open(e) {
    P.go("personal-item", {
      id: e.currentTarget.dataset.id,
      month: this.data.month,
    });
  },
  onReachBottom() {
    if (this.data.nextOffset !== null)
      return P.run(this, () => this.read(true));
  },
});
