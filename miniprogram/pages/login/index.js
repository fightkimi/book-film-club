const api = require("../../lib/api");
Page({
  data: {
    username: "",
    credential: "",
    busy: false,
    error: "",
    baseUrl: require("../../config").baseUrl,
  },
  input(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },
  async submit() {
    if (this.data.busy) return;
    if (!this.data.username || !this.data.credential) {
      this.setData({ error: "请填写小组账号和密码" });
      return;
    }
    this.setData({ busy: true, error: "" });
    try {
      await api.login(this.data.username, this.data.credential);
      this.setData({ credential: "" });
      wx.switchTab({ url: "/pages/activities/index" });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
});
