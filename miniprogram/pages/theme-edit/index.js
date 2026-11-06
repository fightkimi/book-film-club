const C = require("../../lib/page");
const { catalog } = require("../../lib/covers");
const posterOptions = [
  { id: "", title: "按主题名称匹配" },
  { id: "none", title: "不配主题海报" },
  ...catalog,
];

C.define({
  data: { kinds: ["书影联动", "读书", "观影"], kindIndex: 0 },
  ready({ state }) {
    if (this.initialized) return;
    this.initialized = true;
    const old = state.themes.find((t) => t.id === this.query.id);
    const form = Object.assign(
      {
        title: "",
        description: "",
        angles: "",
        tags: "",
        kind: "mixed",
        weight: 1,
        enabled: true,
        poster_key: "",
      },
      old || {},
    );
    if (this.query.ai) {
      form.angles = getApp().globalData.themeDraft || form.angles;
      getApp().globalData.themeDraft = null;
    }
    this.setData({
      form,
      maySave: old ? this.data.isAdmin : this.data.canCreateTheme,
      posterOptions,
      posterIndex: Math.max(
        0,
        posterOptions.findIndex((p) => p.id === (form.poster_key || "")),
      ),
      kindIndex: ["mixed", "book", "movie"].indexOf(form.kind),
    });
  },
  poster(e) {
    const posterIndex = Number(e.detail.value);
    this.setData({
      posterIndex,
      "form.poster_key": posterOptions[posterIndex].id,
    });
  },
  kind(e) {
    this.setData({
      kindIndex: Number(e.detail.value),
      "form.kind": ["mixed", "book", "movie"][e.detail.value],
    });
  },
  save() {
    C.run(this, async () => {
      const r = await C.api.action(
        "theme.save",
        Object.assign({}, this.data.form, {
          weight: Number(this.data.form.weight),
        }),
      );
      wx.redirectTo({ url: "/pages/theme/index?id=" + r.result.id });
    });
  },
});
