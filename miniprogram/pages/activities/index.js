const C = require("../../lib/page"),
  D = require("../../lib/data");
const themes = require("../../lib/theme-browser");
C.define({
  data: { ...themes.data, hubTab: "activities", choosingTheme: false },
  recent: themes.recent,
  toggleHistory: themes.toggleHistory,
  moreHistory: themes.moreHistory,
  draw: themes.draw,
  createTheme: themes.create,
  hub(e) {
    this.setData({ hubTab: e.currentTarget.dataset.tab, choosingTheme: false });
    if (this.data.hubTab === "themes") this.settleIntro();
  },
  blankActivity() {
    C.go("cycle-edit");
  },
  onLoad() {
    const visit = getApp().globalData;
    this.setData({ playIntro: !visit.hasSeenClubIntro });
    visit.hasSeenClubIntro = true;
  },
  settleIntro() {
    this.setData({ playIntro: false });
  },
  onHide() {
    this.settleIntro();
  },
  ready({ state, user }) {
    themes.ready.call(this, { state });
    this.setData({
      loaded: true,
      group: state.group,
      cycles: state.cycles
        .slice()
        .sort((a, b) => b.start.localeCompare(a.start))
        .map((c) =>
          Object.assign(D.cycleView(c), { joined: !!c.participants[user.id] }),
        ),
    });
  },
  create() {
    C.go("cycle-edit");
  },
});
