const C = require("../../lib/page");
C.define({
  data: {
    kindIndex: 0,
    modeIndex: 0,
    kinds: ["读书", "观影", "书影联动"],
    modes: ["换个口味", "延续讨论", "完全随机"],
    phase: "idle",
  },
  ready({ state }) {
    this.setData({
      candidates: state.themes.filter((t) => t.enabled).slice(0, 6),
    });
  },
  kind(e) {
    this.setData({ kindIndex: Number(e.detail.value) });
  },
  mode(e) {
    this.setData({ modeIndex: Number(e.detail.value) });
  },
  draw() {
    if (this.data.phase === "drawing") return;
    C.run(this, async () => {
      const r = await C.api.action("theme.draw", {
        kind: ["book", "movie", "mixed"][this.data.kindIndex],
        mode: ["fresh", "continue", "random"][this.data.modeIndex],
      });
      this.setData({ result: r.result, phase: "drawing" });
      this.timer = setTimeout(() => {
        if (!this._gone) this.setData({ phase: "revealed" });
      }, 2200);
    });
  },
  skip() {
    if (this.timer) clearTimeout(this.timer);
    if (this.data.result) this.setData({ phase: "revealed" });
  },
  openResult() {
    C.go("theme", { id: this.data.result.theme_id });
  },
  create() {
    C.go("cycle-edit", { theme_id: this.data.result.theme_id });
  },
});
