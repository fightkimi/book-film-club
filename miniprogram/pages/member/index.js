const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  ready({ state, users }) {
    const member = users.find((u) => u.id === this.query.id);
    this.setData({
      member,
      cycles: state.cycles
        .filter((c) => c.participants[this.query.id])
        .map((c) => {
          const r =
            (state.reports[c.id] || []).find(
              (r) => r.user_id === this.query.id,
            ) || {};
          return Object.assign(D.cycleView(c), {
            completed: r.completed,
            total: r.total,
            memberStatus: D.labels[r.status] || r.status,
            canWrite: ["active", "closed"].includes(c.status),
          });
        }),
    });
  },
  progress(e) {
    C.go("progress", {
      id: e.currentTarget.dataset.id,
      user_id: this.query.id,
    });
  },
  disable() {
    C.run(this, async () => {
      if (
        !(await C.confirm(
          this.data.member.disabled
            ? "重新启用此成员？"
            : "停用此成员账号？已有活动记录会保留。",
        ))
      )
        return;
      await C.api.action("member.toggle", { id: this.query.id });
      wx.navigateBack();
    });
  },
});
