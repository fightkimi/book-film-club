const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
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
    this.setData({
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
