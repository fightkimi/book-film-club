const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  data: {
    shelfIndex: 0,
    shelves: ["未收藏", "想读 / 想看", "进行中", "已完成"],
  },
  ready({ state, users, user }) {
    const work = state.works.find((w) => w.id === this.query.id);
    if (!work) throw new Error("作品不存在");
    const shelf = state.shelves.find(
      (s) => s.user_id === user.id && s.work_id === work.id,
    );
    this.setData({
      work: D.workView(work),
      sourceName: {
        weread: "微信读书",
        tmdb: "TMDB",
        openlibrary: "Open Library",
        googlebooks: "Google Books",
        manual: "手工资料",
      }[work.provider],
      shelfIndex: ["none", "wish", "reading", "done"].indexOf(
        shelf?.status || "none",
      ),
      reviews: state.reviews
        .filter((r) => r.work_id === work.id)
        .map((r) =>
          Object.assign({}, r, {
            name: (users.find((u) => u.id === r.user_id) || {}).name,
          }),
        ),
      cycles: state.cycles
        .filter((c) => c.works.some((w) => w.id === work.id))
        .map(D.cycleView),
    });
  },
  shelf(e) {
    C.run(this, async () => {
      await C.api.action("shelf.save", {
        work_id: this.query.id,
        status: ["none", "wish", "reading", "done"][e.detail.value],
      });
      this.setData({ shelfIndex: Number(e.detail.value) });
    });
  },
  guide() {
    C.go("guide", { id: this.query.id });
  },
  study() {
    C.go("notebook", { id: this.query.id, mode: "analysis" });
  },
  shots() {
    C.go("notebook", { id: this.query.id, mode: "shots" });
  },
  ratings() {
    C.go("films", { id: this.query.id });
  },
  edit() {
    C.go("work-edit", { id: this.query.id });
  },
  refresh() {
    C.go("metadata", { work_id: this.query.id });
  },
  source() {
    if (this.data.work.source_url)
      wx.setClipboardData({ data: this.data.work.source_url });
  },
  reveal(e) {
    this.setData({ ["revealed." + e.currentTarget.dataset.id]: true });
  },
});
