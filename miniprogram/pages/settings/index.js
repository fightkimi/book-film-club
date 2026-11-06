const C = require("../../lib/page");
C.define({
  ready({ state }) {
    this.setData({ group: state.group });
  },
  importedRecords(){C.go("journal");},
  tools(){C.go("toolkit");},
  async logout() {
    if (await C.confirm("退出本次登录？")) {
      await C.api.logout().catch(() => {});
      wx.reLaunch({ url: "/pages/login/index" });
    }
  },
});
