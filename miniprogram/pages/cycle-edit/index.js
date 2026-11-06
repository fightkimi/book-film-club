const C = require("../../lib/page");
const { activityCover } = require("../../lib/covers");

C.define({
  data: {
    step: 0,
    membersOpen: false,
    rulesOpen: false,
    kinds: ["书影联动", "读书", "观影"],
    kindIndex: 0,
    themeIndex: -1,
    quantityIndex: 0,
    quantities: ["完成全部作品", "任选一部完成"],
    themeDraft: null,
    recentIdeas: [],
    themeError: "",
    themeBusyAction: "",
  },
  ready({ state, users, user }) {
    if (this.initialized) {
      const themes = state.themes;
      this.setData({
        themes,
        themeIndex: themes.findIndex((t) => t.id === this.data.form.theme_id),
      });
      return;
    }
    this.initialized = true;
    const old = state.cycles.find((c) => c.id === this.query.id);
    const mayEdit =
      user.role === "admin" ||
      (this.query.id
        ? old?.created_by === user.id
        : this.data.canStartActivity);
    if (!mayEdit) throw new Error("没有编辑此活动的权限");
    this.setData({ mayEdit });
    if (old && old.status !== "draft")
      throw new Error("活动已发布，规则不可编辑");
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const selectedTheme = state.themes.find(
      (t) => t.id === this.query.theme_id,
    );
    const suggestedWorks = String(this.query.works || "")
      .split(",")
      .filter((id) => state.works.some((w) => w.id === id))
      .slice(0, 24);
    const form = Object.assign(
      {
        title: selectedTheme?.title || "",
        kind: "mixed",
        start: today,
        end: today,
        theme_id: this.query.theme_id || "",
        direction: "",
        member_ids: users.filter((u) => !u.disabled).map((u) => u.id),
        work_ids: suggestedWorks,
        rules: { quantity: "all", review: true, discussion: false },
      },
      old || {},
    );
    if (old) {
      form.member_ids = Object.keys(old.participants);
      form.work_ids = old.works.map((w) => w.id);
    }
    this.worksById = new Map(state.works.map((work) => [work.id, work]));
    const themes = state.themes;
    this.setData({
      form,
      themes,
      themeIndex: themes.findIndex((t) => t.id === form.theme_id),
      kindIndex: ["mixed", "book", "movie"].indexOf(form.kind),
      quantityIndex: form.rules.quantity === "all" ? 0 : 1,
      members: users
        .filter((u) => !u.disabled)
        .map((u) =>
          Object.assign({}, u, { checked: form.member_ids.includes(u.id) }),
        ),
    });
    this.workChoices("", 20);
    this.updateCover();
  },
  workChoices(query, limit) {
    const q = query.trim().toLowerCase();
    const selected = new Set(this.data.form.work_ids);
    const matches = [...this.worksById.values()].filter(
      (w) =>
        !q || (w.title + " " + (w.creator || "")).toLowerCase().includes(q),
    );
    this.setData({
      workQuery: query,
      workCount: matches.length,
      works: matches.slice(0, limit).map((w) => ({
        id: w.id,
        title: w.title,
        metadata_status: w.metadata_status,
        checked: selected.has(w.id),
      })),
    });
  },
  randomTheme() {
    return this.themeAction("draw", async () => {
      const r = await C.api.action("theme.draw", {
        kind: this.data.form.kind,
        mode: "random",
      });
      const themes = r.state.themes;
      const index = themes.findIndex((t) => t.id === r.result.theme_id);
      if (index < 0) throw new Error("主题已更新，请重新选择");
      const previous = this.data.themes[this.data.themeIndex];
      this.setData({
        themes,
        themeIndex: index,
        "form.theme_id": r.result.theme_id,
        ...(!this.data.form.title || this.data.form.title === previous?.title
          ? { "form.title": r.result.theme_title }
          : {}),
      });
      this.updateCover();
      wx.showToast({ title: "已抽取主题", icon: "none" });
    });
  },
  generateTheme() {
    return this.themeAction("generate", async () => {
      const kind = this.data.form.kind;
      const r = await C.api.request("/api/bookstores/activity-theme-ai", {
        task: "activity_theme",
        kind,
        work_ids: this.data.form.work_ids,
        brief: (this.data.form.direction || "").slice(0, 1000),
        rejected: this.data.recentIdeas.slice(-20),
      });
      if (this._gone) return;
      if (this.data.form.kind !== kind)
        throw new Error("活动类型已改变，请重新生成主题");
      this.draftKind = kind;
      this.setData({
        themeDraft: r.draft.theme,
        recentIdeas: this.data.recentIdeas
          .concat(r.draft.theme.title)
          .slice(-20),
      });
    });
  },
  useTheme() {
    return this.themeAction("adopt", async () => {
      const draft = this.data.themeDraft;
      if (!draft || this.draftKind !== this.data.form.kind)
        throw new Error("请先生成符合当前活动类型的主题");
      const snapshot = await C.api.refresh(true);
      const existing = snapshot.state.themes.find(
        (t) => t.title.trim() === draft.title.trim(),
      );
      if (
        existing &&
        (existing.description !== draft.description ||
          existing.angles !== draft.angles)
      )
        throw new Error("已经有同名主题，请再生成一个");
      // A lost save response can be retried without adding the same candidate twice.
      const r = existing
        ? { result: existing, state: snapshot.state }
        : await C.api.action("theme.save", {
            title: draft.title,
            description: draft.description,
            angles: draft.angles,
            kind: this.draftKind,
            tags: "",
            weight: 1,
            enabled: true,
            poster_key: "none",
          });
      const previous = this.data.themes[this.data.themeIndex];
      this.setData({
        themes: r.state.themes,
        themeIndex: r.state.themes.findIndex((t) => t.id === r.result.id),
        "form.theme_id": r.result.id,
        themeDraft: null,
        ...(!this.data.form.title || this.data.form.title === previous?.title
          ? { "form.title": r.result.title }
          : {}),
      });
      this.updateCover();
      wx.showToast({ title: "已选用新主题", icon: "none" });
    });
  },
  themeAction(action, work) {
    return C.run(this, async () => {
      this.setData({ themeError: "", themeBusyAction: action });
      try {
        return await work();
      } catch (e) {
        if (e.status === 401) throw e;
        this.setData({ themeError: e.message || "暂时没有完成，请重试" });
      } finally {
        if (!this._gone) this.setData({ themeBusyAction: "" });
      }
    });
  },
  newTheme() {
    C.go("theme-edit");
  },
  nextStep() {
    this.setData({ step: 1 });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  previousStep() {
    this.setData({ step: 0 });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  toggleMembers() {
    this.setData({ membersOpen: !this.data.membersOpen });
  },
  toggleRules() {
    this.setData({ rulesOpen: !this.data.rulesOpen });
  },
  searchWorks(e) {
    this.workChoices(e.detail.value, 20);
  },
  moreWorks() {
    this.workChoices(this.data.workQuery, this.data.works.length + 20);
  },
  updateCover() {
    const { form, themes, themeIndex } = this.data;
    const works = form.work_ids
      .map((id) => this.worksById.get(id))
      .filter(Boolean);
    this.setData({ cover: activityCover(themes[themeIndex], works) });
  },
  kind(e) {
    this.setData({
      themeDraft: null,
      kindIndex: Number(e.detail.value),
      "form.kind": ["mixed", "book", "movie"][e.detail.value],
    });
  },
  theme(e) {
    const previous = this.data.themes[this.data.themeIndex];
    const next = this.data.themes[e.detail.value];
    this.setData({
      themeIndex: Number(e.detail.value),
      "form.theme_id": this.data.themes[e.detail.value].id,
      ...(!this.data.form.title || this.data.form.title === previous?.title
        ? { "form.title": next.id ? next.title : "" }
        : {}),
    });
    this.updateCover();
  },
  quantity(e) {
    this.setData({
      quantityIndex: Number(e.detail.value),
      "form.rules.quantity": ["all", "any"][e.detail.value],
    });
  },
  members(e) {
    this.setData({
      "form.member_ids": e.detail.value,
      members: this.data.members.map((m) => ({
        ...m,
        checked: e.detail.value.includes(m.id),
      })),
    });
  },
  works(e) {
    const visible = new Set(this.data.works.map((w) => w.id));
    const retained = this.data.form.work_ids.filter((id) => !visible.has(id));
    const chosen = [...retained, ...e.detail.value];
    this.setData({
      "form.work_ids": chosen,
      works: this.data.works.map((w) => ({
        ...w,
        checked: chosen.includes(w.id),
      })),
    });
    this.updateCover();
  },
  save() {
    C.run(this, async () => {
      const r = await C.api.action("cycle.save", this.data.form);
      wx.redirectTo({ url: "/pages/cycle/index?id=" + r.result.id });
    });
  },
});
