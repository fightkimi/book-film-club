const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  data: {
    kindIndex: 0,
    minutesIndex: 0,
    kinds: ["书与电影", "书籍", "电影"],
    durations: ["不限片长", "90 分钟", "120 分钟", "180 分钟"],
    exclude: true,
    mood: "",
    rows: null,
    aiResult: false,
  },
  ready({ state }) {
    const theme = state.themes.find((t) => t.id === this.query.theme_id);
    if (!theme) throw new Error("主题不存在");
    this.setData({
      theme,
      cycle: state.cycles.find((c) => c.id === this.query.cycle_id) || null,
    });
  },
  preferences() {
    return {
      theme_id: this.query.theme_id,
      kind: ["mixed", "book", "movie"][this.data.kindIndex],
      minutes: [0, 90, 120, 180][this.data.minutesIndex],
      exclude_seen: this.data.exclude,
      mood: this.data.mood,
    };
  },
  change(e) {
    this.setData({
      [e.currentTarget.dataset.field]: e.detail.value,
      rows: null,
      aiResult: false,
    });
  },
  search() {
    C.run(this, async () => {
      const r = await C.api.request("/api/discover", this.preferences());
      this.setData({
        rows: r.works.map(D.workView),
        total: r.total,
        aiResult: false,
      });
    });
  },
  generate() {
    C.run(this, async () => {
      const r = await C.api.request(
        "/api/ai",
        Object.assign({ task: "recommend" }, this.preferences()),
      );
      this.setData({
        rows: r.draft.recommendations.map((x) =>
          Object.assign(D.workView(r.works.find((w) => w.id === x.work_id)), x),
        ),
        aiResult: true,
      });
    });
  },
  nominate(e) {
    C.run(this, async () => {
      const r = await C.api.action("nominate", {
        cycle_id: this.query.cycle_id,
        work_id: e.currentTarget.dataset.id,
      });
      this.setData({
        notice: "已提名到本期",
        cycle: r.state.cycles.find((c) => c.id === this.query.cycle_id),
      });
    });
  },
  add() {
    C.go("metadata");
  },
});
