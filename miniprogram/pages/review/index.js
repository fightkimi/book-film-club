const C = require("../../lib/page");
C.define({
  data: {
    workIndex: 0,
    ratingIndex: 3,
    ratings: ["1 分", "2 分", "3 分", "4 分", "5 分"],
    body: "",
    spoiler: false,
    draft: null,
  },
  ready({ state, user }) {
    const cycle = state.cycles.find((c) => c.id === this.query.id);
    if (!cycle || !["active", "closed"].includes(cycle.status))
      throw new Error("归档或筹备活动不能编辑感想");
    this.setData({ cycle });
    if (!this.initialized) {
      this.initialized = true;
      this.loadReview();
    }
  },
  loadReview() {
    const { state, user } = C.api.get();
    const r = state.reviews.find(
      (r) =>
        r.cycle_id === this.query.id &&
        r.work_id === this.data.cycle.works[this.data.workIndex]?.id &&
        r.user_id === user.id,
    );
    this.setData({
      body: r?.body || "",
      spoiler: r?.spoiler || false,
      ratingIndex: (r?.rating || 4) - 1,
      draft: null,
      original: null,
    });
  },
  work(e) {
    this.setData({ workIndex: Number(e.detail.value) });
    this.loadReview();
  },
  rating(e) {
    this.setData({ ratingIndex: Number(e.detail.value) });
  },
  assist() {
    C.run(this, async () => {
      const source = this.data.body,
        spoiler = this.data.spoiler;
      const r = await C.api.request("/api/ai", {
        task: "review",
        cycle_id: this.query.id,
        work_id: this.data.cycle.works[this.data.workIndex].id,
        body: source,
        spoiler,
      });
      this.setData({
        draft: r.draft,
        draftSource: source,
        draftSpoiler: spoiler,
      });
    });
  },
  adopt() {
    if (
      this.data.body !== this.data.draftSource ||
      this.data.spoiler !== this.data.draftSpoiler
    ) {
      this.setData({ error: "原稿已改变，请重新整理" });
      return;
    }
    this.setData({
      original: this.data.body,
      body: this.data.draft.polished,
      draft: null,
    });
  },
  restore() {
    this.setData({ body: this.data.original, original: null });
  },
  save() {
    C.run(this, async () => {
      await C.api.action("review.save", {
        cycle_id: this.query.id,
        work_id: this.data.cycle.works[this.data.workIndex].id,
        rating: this.data.ratingIndex + 1,
        body: this.data.body,
        spoiler: this.data.spoiler,
      });
      wx.navigateBack();
    });
  },
});
