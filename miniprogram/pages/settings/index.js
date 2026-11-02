const C = require("../../lib/page");
C.define({
  data: { current: "", credential: "" },
  ready() {
    this.setData({ baseUrl: require("../../config").baseUrl });
  },
  save() {
    C.run(this, async () => {
      await C.api.request("/api/credential", {
        current: this.data.current,
        credential: this.data.credential,
      });
      this.setData({
        current: "",
        credential: "",
        notice: "密码已更新，其他会话已退出",
      });
    });
  },
});
