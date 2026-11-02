const C = require("../../lib/page");
C.define({
  data: {
    kinds: ["书影联动", "读书", "观影"],
    kindIndex: 0,
    themeIndex: 0,
    quantityIndex: 0,
    quantities: ["完成全部作品", "任选一部完成"],
  },
  ready({ state, users }) {
    if (this.initialized) return;
    this.initialized = true;
    const old = state.cycles.find((c) => c.id === this.query.id);
    if (old && old.status !== "draft")
      throw new Error("活动已发布，规则不可编辑");
    const today = new Date().toISOString().slice(0, 10);
    const form = Object.assign(
      {
        title: "",
        kind: "mixed",
        start: today,
        end: today,
        theme_id: this.query.theme_id || state.themes[0]?.id || "",
        direction: "",
        member_ids: users.filter((u) => !u.disabled).map((u) => u.id),
        work_ids: [],
        rules: { quantity: "all", review: true, discussion: false },
      },
      old || {},
    );
    if (old) {
      form.member_ids = Object.keys(old.participants);
      form.work_ids = old.works.map((w) => w.id);
    }
    this.setData({
      form,
      themes: state.themes,
      themeIndex: Math.max(
        0,
        state.themes.findIndex((t) => t.id === form.theme_id),
      ),
      kindIndex: ["mixed", "book", "movie"].indexOf(form.kind),
      quantityIndex: form.rules.quantity === "all" ? 0 : 1,
      members: users
        .filter((u) => !u.disabled)
        .map((u) =>
          Object.assign({}, u, { checked: form.member_ids.includes(u.id) }),
        ),
      works: state.works.map((w) =>
        Object.assign({}, w, { checked: form.work_ids.includes(w.id) }),
      ),
    });
  },
  kind(e) {
    this.setData({
      kindIndex: Number(e.detail.value),
      "form.kind": ["mixed", "book", "movie"][e.detail.value],
    });
  },
  theme(e) {
    this.setData({
      themeIndex: Number(e.detail.value),
      "form.theme_id": this.data.themes[e.detail.value].id,
    });
  },
  quantity(e) {
    this.setData({
      quantityIndex: Number(e.detail.value),
      "form.rules.quantity": ["all", "any"][e.detail.value],
    });
  },
  members(e) {
    this.setData({ "form.member_ids": e.detail.value });
  },
  works(e) {
    this.setData({ "form.work_ids": e.detail.value });
  },
  save() {
    C.run(this, async () => {
      const r = await C.api.action("cycle.save", this.data.form);
      wx.redirectTo({ url: "/pages/cycle/index?id=" + r.result.id });
    });
  },
});
