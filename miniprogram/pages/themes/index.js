const C = require("../../lib/page");
const { themePoster } = require("../../lib/covers");
C.define({
  ready({ state }) {
    this.setData({
      themes: state.themes.map((t, i) =>
        Object.assign({}, t, {
          poster: themePoster(t),
          number: String(i + 1).padStart(2, "0"),
          uses: state.cycles.filter(
            (c) => c.theme_id === t.id && c.status !== "draft",
          ).length,
        }),
      ),
      draws: state.draws.slice(-20).reverse(),
    });
  },
  draw() {
    C.go("draw");
  },
  create() {
    C.go("theme-edit");
  },
});
