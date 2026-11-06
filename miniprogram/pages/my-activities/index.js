const C = require("../../lib/page");
const participation = require("../../lib/participation");
C.define({
  data: { attending: [], sections: [], attendanceError: "" },
  async ready({ state, user }) {
    const result = await participation.load(state, user);
    if (this._gone) return;
    this.setData({
      ...result,
      sections: [
        { id: "upcoming", title: "即将参加" },
        { id: "current", title: "进行中" },
        { id: "past", title: "往期" },
      ]
        .map((s) => ({
          ...s,
          items: result.attending.filter((r) => r.bucket === s.id),
        }))
        .filter((s) => s.items.length),
    });
  },
});
