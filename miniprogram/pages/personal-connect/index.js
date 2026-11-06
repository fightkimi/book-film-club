const P = require("../../lib/personal-api");
P.define({
  data: { connection: null, key: "" },
  onHide() {
    this.setData({ key: "" });
  },
  async load() {
    this.setData({ connection: await P.call("connection") });
  },
  connect() {
    return P.run(this, async () => {
      const key = this.data.key.trim();
      this.setData({ key: "" });
      const connection = await P.call("connect", {
        key,
        generation: this.data.connection?.generation || "",
      });
      this.setData({ connection });
      wx.showToast({ title: "已连接" });
    });
  },
  sync() {
    return P.run(this, async () => {
      this.setData({ connection: await P.call("sync-shelf", {}) });
      wx.showToast({ title: "书架已同步" });
    });
  },
  disconnect() {
    return P.run(this, async () => {
      if (
        !(await P.confirm(
          "停止同步并清除同步的书架、原始笔记。你的计划、手写感想和已保存整理会保留。",
          { title: "断开微信读书？", confirmText: "断开" },
        ))
      )
        return;
      this.setData({
        connection: await P.call("disconnect", {
          generation: this.data.connection.generation,
        }),
        key: "",
      });
    });
  },
  obtain() {
    wx.setClipboardData({ data: "https://weread.qq.com/r/weread-skills" });
  },
  books() {
    P.go("personal-add", { source: "weread", month: P.currentMonth() });
  },
});
