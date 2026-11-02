const C = require("../../lib/page");
C.define({
  data: {
    queryText: "",
    kindIndex: 0,
    providerIndex: 0,
    kinds: ["书籍", "电影"],
    providerNames: ["微信读书", "Open Library", "Google Books"],
    providers: ["weread", "openlibrary", "googlebooks"],
    results: null,
    preview: null,
  },
  ready({ state, services }) {
    if (this.initialized) return;
    this.initialized = true;
    const work = state.works.find((w) => w.id === this.query.work_id);
    this.setData({
      work: work || null,
      queryText: this.query.title || work?.title || "",
      kindIndex: (this.query.kind || work?.kind) === "movie" ? 1 : 0,
      providerIndex:
        work && this.data.providers.includes(work.provider)
          ? this.data.providers.indexOf(work.provider)
          : services.weread
            ? 0
            : 1,
    });
  },
  kind(e) {
    this.setData({
      kindIndex: Number(e.detail.value),
      results: null,
      preview: null,
    });
  },
  provider(e) {
    this.setData({ providerIndex: Number(e.detail.value), results: null });
  },
  search() {
    C.run(this, async () => {
      const r = await C.api.request("/api/metadata/search", {
        kind: this.data.kindIndex ? "movie" : "book",
        provider: this.data.kindIndex
          ? "tmdb"
          : this.data.providers[this.data.providerIndex],
        query: this.data.queryText,
      });
      this.setData({ results: r.results });
    });
  },
  detail(e) {
    C.run(this, async () => {
      const item = this.data.results[e.currentTarget.dataset.index];
      const r = await C.api.request("/api/metadata/detail", {
        provider: item.provider,
        source_id: item.source_id,
      });
      this.setData({ preview: r });
    });
  },
  back() {
    this.setData({ preview: null });
  },
  save() {
    C.run(this, async () => {
      const r = await C.api.action("metadata.import", {
        token: this.data.preview.token,
        id: this.data.work?.id,
      });
      wx.redirectTo({ url: "/pages/work/index?id=" + r.result.id });
    });
  },
  manual() {
    getApp().globalData.workDraft = this.data.preview?.item || {
      kind: this.data.kindIndex ? "movie" : "book",
      title: this.data.queryText,
    };
    C.go("work-edit", { id: this.data.work?.id || "", draft: 1 });
  },
});
