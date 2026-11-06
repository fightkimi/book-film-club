const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  ready({ state, user }) {
    this.setData({
      group: state.group,
      reports: state.cycles
        .slice()
        .sort((a, b) => b.start.localeCompare(a.start))
        .flatMap((cycle) =>
          (state.reports[cycle.id] || [])
            .filter((report) => report.user_id === user.id)
            .map((report) =>
              Object.assign({}, report, {
                cycle_id: cycle.id,
                cycleTitle: cycle.title,
                startLabel: D.date(cycle.start),
                statusLabel: D.labels[report.status] || report.status,
              }),
            ),
        ),
      journalCount: (state.journals || []).length,
    });
  },
  archive() {
    C.go("toolkit", { tab: "archive" });
  },
  personalBooks() {
    wx.switchTab({ url: "/pages/library/index" });
  },
  personalConnect() {
    C.go("personal-connect");
  },
  following() {
    C.go("bookstore-following");
  },
  toolkit() {
    C.go("toolkit");
  },
  members() {
    C.go("members");
  },
  settings() {
    C.go("settings");
  },
});
