const C = require("../../lib/page");
const { posterUrl } = require("../../lib/poster-url");
C.define({
  data: { page: 1, result: null },
  async ready({ state }) {
    this.setData({
      work: state.works.find((w) => w.id === this.query.id) || null,
    });
    await this.fetch();
  },
  async fetch() {
    const r = await C.api.request(
      this.query.id ? "/api/metadata/extras" : "/api/metadata/charts",
      this.query.id ? { work_id: this.query.id } : { page: this.data.page },
    );
    this.setData({
      result: r,
      items: (r.related || r.items || []).map((w) => ({
        ...w,
        coverUrl: posterUrl(w.image),
      })),
    });
  },
  next(e) {
    C.run(this, async () => {
      this.setData({
        page: this.data.page + Number(e.currentTarget.dataset.step),
      });
      await this.fetch();
    });
  },
  search(e) {
    C.go("metadata", { title: e.currentTarget.dataset.title, kind: "movie" });
  },
});
