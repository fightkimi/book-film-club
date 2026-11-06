const C = require("../../lib/page"),
  D = require("../../lib/data");
const P = require("../../lib/personal-api");
const { posterUrl } = require("../../lib/poster-url");
C.define({
  async ready({ state, users }) {
    let work;
    const bibliographicOnly = !!(this.query.book_id || this.query.weread_id);
    if (this.query.weread_id || this.query.book_source === "public") {
      const r = await C.api.request("/api/metadata/detail", {
        provider: "weread",
        source_id: this.query.weread_id || this.query.book_id,
      });
      work = r.item;
    } else if (bibliographicOnly) {
      const r = await P.call("book-detail", undefined, {
        id: this.query.book_id,
        source: this.query.book_source,
      });
      work = r.book;
    } else work = state.works.find((w) => w.id === this.query.id);
    if (!work) throw new Error("作品不存在");
    this.setData({
      bibliographicOnly,
      work: D.workView(work),
      coverUrl: posterUrl(work.image, "w500"),
      sourceName: {
        weread: "微信读书",
        tmdb: "TMDB",
        openlibrary: "Open Library",
        googlebooks: "Google Books",
        manual: "手工资料",
      }[work.provider],
      reviews: (bibliographicOnly ? [] : state.reviews)
        .filter((r) => r.work_id === work.id)
        .map((r) =>
          Object.assign({}, r, {
            name: (users.find((u) => u.id === r.user_id) || {}).name,
          }),
        ),
      cycles: (bibliographicOnly ? [] : state.cycles)
        .filter((c) => c.works.some((w) => w.id === work.id))
        .map(D.cycleView),
    });
  },
  personal() {
    C.go("personal-add", {
      book:
        this.query.weread_id || this.query.book_id || "work:" + this.query.id,
      month: this.query.month || P.currentMonth(),
      source: this.query.weread_id
        ? "public"
        : this.query.book_source || "catalog",
      kind: this.data.work.kind,
    });
  },
  writeReview() {
    C.run(this, async () => {
      const source =
        this.query.book_source === "notebooks"
          ? "weread"
          : this.query.weread_id
            ? "public"
            : this.query.book_source || "catalog";
      const r = await P.call("add", {
        source,
        source_id:
          this.query.weread_id || this.query.book_id || "work:" + this.query.id,
        kind: this.data.work.kind,
      });
      C.go("personal-item", { id: r.item.id });
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
