const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  ready({ state }) {
    const theme = state.themes.find((t) => t.id === this.query.id);
    if (!theme) throw new Error("主题不存在");
    this.setData({
      theme,
      cycles: state.cycles
        .filter((c) => c.theme_id === theme.id)
        .map(D.cycleView),
    });
  },
  edit() {
    C.go("theme-edit", { id: this.query.id });
  },
  create() {
    C.go("cycle-edit", { theme_id: this.query.id });
  },
  recommend() {
    C.go("recommend", { theme_id: this.query.id });
  },
  analyze() {
    C.run(this, async () => {
      const r = await C.api.request("/api/ai", {
        task: "analyze",
        theme_id: this.query.id,
      });
      this.setData({ draft: r.draft });
    });
  },
  adopt() {
    C.go("theme-edit", { id: this.query.id, ai: 1 });
    getApp().globalData.themeDraft = this.data.draft.analysis;
  },
});
