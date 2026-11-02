const C = require("../../lib/page");
const catalog = require("../../assets/posters");
C.define({
  ready({ state }) {
    this.setData({
      themes: state.themes.map((t, i) =>
        Object.assign({}, t, {
          poster: (() => {
            const p =
              t.poster_key === "none"
                ? null
                : catalog.find(
                    (p) =>
                      p.id === t.poster_key ||
                      (!t.poster_key && p.theme === t.title),
                  );
            return p ? { image: C.api.asset(p.image), title: p.title } : null;
          })(),
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
