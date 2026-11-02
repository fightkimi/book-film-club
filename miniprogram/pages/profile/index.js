const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  ready({ state, user }) {
    this.setData({
      group: state.group,
      reports: state.cycles.flatMap((cycle) =>
        (state.reports[cycle.id] || [])
          .filter((report) => report.user_id === user.id)
          .map((report) =>
            Object.assign({}, report, {
              cycle_id: cycle.id,
              cycleTitle: cycle.title,
              statusLabel: D.labels[report.status] || report.status,
            }),
          ),
      ),
      journalCount: (state.journals || []).length,
      studyCount: (state.studies || []).length,
    });
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
  async logout() {
    if (await C.confirm("退出本次登录？")) {
      await C.api.logout().catch(() => {});
      wx.reLaunch({ url: "/pages/login/index" });
    }
  },
});
