const C = require("../../lib/page");
C.define({
  data: {
    mode: "analysis",
    notes: "",
    shots: [],
    reflection: "",
    draft: null,
    videoSrc: "",
    original: null,
  },
  ready({ state }) {
    if (this.initialized) return;
    this.initialized = true;
    const work = state.works.find((w) => w.id === this.query.id);
    if (!work) throw new Error("作品不存在");
    const mode = this.query.mode === "shots" ? "shots" : "analysis";
    if (mode === "shots" && work.kind !== "movie")
      throw new Error("逐镜记录仅适用于电影");
    const old = (state.studies || []).find(
      (s) => s.work_id === work.id && s.mode === mode,
    );
    this.setData({
      work,
      mode,
      notes: old?.notes || "",
      shots: old?.shots || [],
      reflection: old?.reflection || "",
    });
  },
  chooseVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["video"],
      sourceType: ["album"],
      success: (r) => this.setData({ videoSrc: r.tempFiles[0].tempFilePath }),
      fail: () => {},
    });
  },
  addShot() {
    const shots = this.data.shots;
    if (shots.length >= 30) {
      this.setData({ error: "每份笔记最多 30 个镜头" });
      return;
    }
    const start = shots.length ? Number(shots[shots.length - 1].end) : 0;
    this.setData({
      shots: shots.concat({
        start,
        end: start + 5,
        evidence: "",
        composition: "",
        movement: "",
        cut: "",
        sound: "",
      }),
    });
  },
  shotInput(e) {
    const { index, field } = e.currentTarget.dataset;
    this.setData({
      ["shots[" + index + "]." + field]: ["start", "end"].includes(field)
        ? Number(e.detail.value)
        : e.detail.value,
    });
  },
  remove(e) {
    this.setData({
      shots: this.data.shots.filter(
        (_, i) => i !== Number(e.currentTarget.dataset.index),
      ),
    });
  },
  payload() {
    return {
      work_id: this.query.id,
      mode: this.data.mode,
      notes: this.data.notes,
      shots: this.data.shots,
    };
  },
  generate() {
    C.run(this, async () => {
      const payload = this.payload(),
        reflection = this.data.reflection;
      const r = await C.api.request(
        "/api/ai",
        Object.assign({ task: "study" }, payload),
      );
      this.setData({
        draft: r.draft,
        draftSource: JSON.stringify(payload),
        draftReflection: reflection,
      });
    });
  },
  adopt() {
    if (
      this.data.draftSource !== JSON.stringify(this.payload()) ||
      this.data.draftReflection !== this.data.reflection
    ) {
      this.setData({ error: "笔记已改变，请重新分析" });
      return;
    }
    const r = this.data.draft;
    this.setData({
      original: this.data.reflection,
      reflection: [r.summary]
        .concat(
          r.claims.map(
            (c) => "证据：" + c.quote + "\n解读：" + c.interpretation,
          ),
        )
        .concat(["继续观察：\n" + r.questions.join("\n")])
        .join("\n\n"),
      draft: null,
    });
  },
  restore() {
    this.setData({ reflection: this.data.original, original: null });
  },
  save() {
    C.run(this, async () => {
      await C.api.action(
        "study.save",
        Object.assign(this.payload(), { reflection: this.data.reflection }),
      );
      this.setData({ notice: "已保存，仅自己可见" });
      wx.showToast({ title: "已保存", icon: "success" });
    });
  },
});
