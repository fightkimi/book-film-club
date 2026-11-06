const C = require("../../lib/page");
C.define({
  ready({ state }) {
    this.setData({ group: state.group });
  },
  importedRecords(){C.go("journal");},
  tools(){C.go("toolkit");},
  tmdb(){wx.setClipboardData({data:"https://www.themoviedb.org"});},
  logoLicense(){wx.setClipboardData({data:"https://creativecommons.org/licenses/by-sa/4.0/"});},
  async logout() {
    if (await C.confirm("退出本次登录？")) {
      await C.api.logout().catch(() => {});
      wx.reLaunch({ url: "/pages/login/index" });
    }
  },
});
