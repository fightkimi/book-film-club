const C = require("../../lib/page");
const participation = require("../../lib/participation");
C.define({
  data: { attending: [], attendanceError: "" },
  async ready({ state, user }) {
    this.setData({
      group: state.group,
    });
    const result = await participation.load(state, user);
    if (!this._gone) this.setData({ ...result, attendingPreview: result.attending.slice(0, 3) });
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
