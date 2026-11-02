const C = require("../../lib/page");
C.define({
  data: { kinds: ["书籍", "电影"], kindIndex: 0 },
  ready({ state }) {
    if (this.initialized) return;
    this.initialized = true;
    const old = state.works.find((w) => w.id === this.query.id);
    const draft = this.query.draft ? getApp().globalData.workDraft : {};
    getApp().globalData.workDraft = null;
    const form = Object.assign(
      {
        kind: "book",
        title: "",
        creator: "",
        year: "",
        description: "",
        image: "",
        source_url: "",
        tags: "",
        metadata_status: "pending",
      },
      draft || {},
      old || {},
    );
    this.setData({
      form,
      kindIndex: form.kind === "movie" ? 1 : 0,
      confirmed: form.metadata_status === "confirmed",
    });
  },
  kind(e) {
    this.setData({
      kindIndex: Number(e.detail.value),
      "form.kind": ["book", "movie"][e.detail.value],
    });
  },
  confirm(e) {
    this.setData({
      confirmed: e.detail.value,
      "form.metadata_status": e.detail.value ? "confirmed" : "pending",
    });
  },
  save() {
    C.run(this, async () => {
      const r = await C.api.action("work.save", this.data.form);
      wx.redirectTo({ url: "/pages/work/index?id=" + r.result.id });
    });
  },
});
