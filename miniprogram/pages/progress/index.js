const C = require("../../lib/page");
C.define({
  data: { workIndex: 0, progress: 0, note: "" },
  ready({ state, users, user }) {
    const cycle = state.cycles.find((c) => c.id === this.query.id);
    if (!cycle || !["active", "closed"].includes(cycle.status))
      throw new Error("仅进行中或已结束的活动可以登记");
    this.setData({
      cycle,
      target: this.query.user_id || user.id,
      targetName: (
        users.find((u) => u.id === (this.query.user_id || user.id)) || {}
      ).name,
    });
    if (!this.initialized) {
      this.initialized = true;
      this.loadRecord();
    }
  },
  loadRecord() {
    const { state } = C.api.get();
    const r = state.records.find(
      (r) =>
        r.cycle_id === this.query.id &&
        r.work_id === this.data.cycle.works[this.data.workIndex]?.id &&
        r.user_id === this.data.target,
    );
    this.setData({ progress: r?.progress || 0, note: r?.note || "" });
  },
  work(e) {
    this.setData({ workIndex: Number(e.detail.value) });
    this.loadRecord();
  },
  percent(e) {
    this.setData({ progress: Number(e.detail.value) });
  },
  save() {
    C.run(this, async () => {
      await C.api.action("record.save", {
        cycle_id: this.query.id,
        work_id: this.data.cycle.works[this.data.workIndex].id,
        user_id: this.data.target,
        progress: Number(this.data.progress),
        note: this.data.note,
      });
      wx.navigateBack();
    });
  },
});
