const C = require("../../lib/page");
C.define({
  data: { body: "", draft: "" },
  ready({ state }) {
    if (this.initialized) return;
    this.initialized = true;
    const cycle = state.cycles.find((c) => c.id === this.query.id);
    if (!cycle) throw new Error("活动不存在");
    this.setData({ body: cycle.recap || "", cycle });
  },
  generate() {
    C.run(this, async () => {
      const r = await C.api.request("/api/ai", {
        task: "recap",
        cycle_id: this.query.id,
      });
      this.setData({ draft: r.draft.recap });
    });
  },
  adopt() {
    this.setData({ body: this.data.draft, draft: "" });
  },
  save() {
    C.run(this, async () => {
      await C.api.action("recap.save", {
        cycle_id: this.query.id,
        body: this.data.body,
      });
      wx.navigateBack();
    });
  },
});
