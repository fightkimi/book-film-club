const C = require("../../lib/page");

const kinds = [
  { value: "mixed", label: "书影联动" },
  { value: "book", label: "读书" },
  { value: "movie", label: "观影" },
];
const modes = [
  { value: "fresh", label: "换个口味", hint: "避开最近三期用过的主题。" },
  {
    value: "continue",
    label: "延续讨论",
    hint: "从以前办过活动的主题中抽取。",
  },
  {
    value: "random",
    label: "完全随机",
    hint: "所有符合类型的候选主题都可参与，按主题权重抽取。",
  },
];

C.define({
  data: {
    kinds,
    modes,
    kindIndex: 0,
    modeIndex: 0,
    phase: "idle",
    result: null,
    poolReady: false,
    candidateCount: 0,
  },
  ready({ state }) {
    this.hidden = false;
    this.themes = state.themes;
    this.used = state.cycles
      .filter((c) => c.status !== "draft")
      .sort((a, b) =>
        (b.published_at || "").localeCompare(a.published_at || ""),
      )
      .map((c) => c.theme_id);
    this.updatePool();
  },
  updatePool() {
    const kind = kinds[this.data.kindIndex].value;
    const mode = modes[this.data.modeIndex].value;
    const eligible = (this.themes || []).filter(
      (t) =>
        t.enabled &&
        (kind === "mixed" || t.kind === kind || t.kind === "mixed") &&
        (mode !== "fresh" || !this.used.slice(0, 3).includes(t.id)) &&
        (mode !== "continue" || this.used.includes(t.id)),
    );
    this.setData({ candidateCount: eligible.length, poolReady: true });
  },
  choose(e) {
    if (this.data.busy || this.data.phase === "drawing") return;
    const { field, index } = e.currentTarget.dataset;
    if (this.data[field] === Number(index)) return;
    this.setData({ [field]: Number(index), phase: "idle", result: null });
    this.updatePool();
  },
  draw() {
    if (
      this.data.busy ||
      !this.data.isAdmin ||
      !this.data.candidateCount ||
      this.data.phase === "drawing"
    )
      return;
    return C.run(this, async () => {
      const r = await C.api.action("theme.draw", {
        kind: kinds[this.data.kindIndex].value,
        mode: modes[this.data.modeIndex].value,
      });
      if (this._gone) return;
      const theme = this.themes.find((t) => t.id === r.result.theme_id);
      const result = {
        ...r.result,
        description: theme?.description || "",
      };
      this.filmStarted = false;
      this.setData({ result, phase: this.hidden ? "revealed" : "drawing" });
      if (!this.hidden) this.timer = setTimeout(() => this.reveal(), 5500);
    });
  },
  filmLoaded() {
    if (this.data.phase !== "drawing" || this.filmStarted) return;
    this.filmStarted = true;
    clearTimeout(this.timer);
    // Play the complete review clip, including the hold on the blank card.
    this.timer = setTimeout(() => this.reveal(), 4000);
  },
  reveal() {
    clearTimeout(this.timer);
    if (!this._gone && this.data.result) this.setData({ phase: "revealed" });
  },
  onHide() {
    this.hidden = true;
    if (this.data.phase === "drawing") this.reveal();
  },
  adjust() {
    if (!this.data.busy) this.setData({ phase: "idle", result: null });
  },
  openResult() {
    C.go("theme", { id: this.data.result.theme_id });
  },
  create() {
    C.go("cycle-edit", { theme_id: this.data.result.theme_id });
  },
});
