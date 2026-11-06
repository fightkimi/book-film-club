const artwork = require("../../lib/static-assets");
const {
  fetchBookstore,
  writeBookstore,
  task,
} = require("../../lib/bookstore-api");
Page({
  data: {
    scene:artwork.bookshop,
    authorized: false,
    busy: false,
    error: "",
    loaded: false,
    stores: [],
    updates: [],
    nextCursor: "",
  },
  onShow() {
    this.load();
  },
  onHide() {
    this.setData({ authorized: false });
  },
  async read(more = false) {
    const r = await fetchBookstore("following", {
      before: more ? this.data.nextCursor : "",
    });
    const updates = r.updates.map((item) => ({
      ...item,
      url:
        item.type === "post"
          ? "/pages/bookstore-topic/index?id=" + item.id
          : item.type === "gathering"
            ? "/pages/bookstore-gathering/index?id=" + item.id + "&circle=0"
            : "/pages/bookstore/index?id=" + item.shop,
      label:
        item.type === "arrival"
          ? "书店上新"
          : item.type === "post"
            ? item.kind
            : item.state === "cancelled"
              ? "已取消"
              : item.state === "ended"
                ? "已散场"
                : item.kind === "notice"
                  ? "书店告示"
                  : "店里有约",
    }));
    this.setData({
      loaded: true,
      stores: r.stores,
      updates: more ? this.data.updates.concat(updates) : updates,
      nextCursor: r.next,
    });
  },
  load() {
    return task(this, () => this.read());
  },
  next() {
    if (this.data.nextCursor) return task(this, () => this.read(true));
  },
  unfollow(e) {
    return task(this, async () => {
      await writeBookstore("follow", {
        shop: e.currentTarget.dataset.id,
        enabled: false,
      });
      await this.read();
      wx.showToast({ title: "已取消关注", icon: "none" });
    });
  },
});
