const sharing = require("../../lib/sharing");
const artwork = require("../../lib/static-assets");
const { fetchBookstore, task } = require("../../lib/bookstore-api");
const { valid } = require("../../lib/gatherings");
Page({
  data: {scene:artwork.sisters, authorized: false, busy: false, error: "", v: null },
  onLoad(q) {
    this.id = valid(q.id) ? q.id : "";
  },
  onHide() {
    this.setData({ authorized: false });
  },
  onShow() {
    sharing.enable();
    this.load();
  },
  load() {
    return task(this, async () => {
      if (!this.id) throw new Error("活动卡片无效");
      const v = await fetchBookstore("gather-detail", { event: this.id });
      if (!v.can_manage || v.kind !== "meet")
        throw new Error("请从自己管理的活动进入");
      this.setData({ v });
      if (v.state !== "open") this.view();
    });
  },
  view() {
    if (this.data.v)
      wx.redirectTo({
        url:
          "/pages/bookstore-gathering/index?id=" +
          this.id +
          "&circle=" +
          (this.data.v.audience === "circle" ? "1" : "0"),
      });
  },
  onShareAppMessage: sharing.message,
});
