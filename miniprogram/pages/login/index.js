const api = require("../../lib/api");

Page({
  data: { busy: false, error: "", invited: false },

  onLoad(options) {
    this.invite = options.invite || "";
    this.setData({ invited: Boolean(this.invite) });
  },

  async submit() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: "" });
    try {
      await api.loginWithWeChat(this.invite);
      this.invite = "";
      wx.switchTab({ url: "/pages/activities/index" });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ busy: false });
    }
  },
});
