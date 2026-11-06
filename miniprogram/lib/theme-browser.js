const C = require("./page");
const { themePoster } = require("./covers");
const HISTORY_BATCH = 5;

function historyRow(draw) {
  const time = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(draw.at || "");
  return {
    id: draw.id,
    title: draw.theme_title,
    time: time
      ? time[1] +
        " 年 " +
        Number(time[2]) +
        " 月 " +
        Number(time[3]) +
        " 日 " +
        time[4]
      : draw.at || "",
  };
}

module.exports = {
  data: { historyOpen: false, historyTotal: 0, draws: [] },
  ready({ state }) {
    this.history = state.draws || [];
    this.setData({
      themes: (state.themes || [])
        .filter((t) => state.cycles.some((c) => c.theme_id === t.id))
        .map((t, i) =>
          Object.assign({}, t, {
            poster: themePoster(t),
            number: String(i + 1).padStart(2, "0"),
            uses: state.cycles.filter((c) => c.theme_id === t.id).length,
          }),
        ),
      historyTotal: this.history.length,
      draws: this.data.historyOpen
        ? this.recent(Math.max(HISTORY_BATCH, this.data.draws.length))
        : [],
    });
  },
  recent(limit) {
    return (this.history || []).slice(-limit).reverse().map(historyRow);
  },
  toggleHistory() {
    const historyOpen = !this.data.historyOpen;
    this.setData({
      historyOpen,
      draws: historyOpen ? this.recent(HISTORY_BATCH) : [],
    });
  },
  moreHistory() {
    if (!this.data.historyOpen) return;
    this.setData({
      draws: this.recent(this.data.draws.length + HISTORY_BATCH),
    });
  },
  draw() {
    C.go("draw");
  },
  create() {
    C.go("theme-edit");
  },
};
