const sharing = require("../../lib/sharing");
const {
  fetchBookstore,
  writeBookstore,
  task,
} = require("../../lib/bookstore-api");
require("../../lib/bookstore-api").define({
  onShareAppMessage: sharing.message,
  data: { busy: false, error: "", replies: [], body: "", more: false },
  onLoad(q) {
    this.id = q.id;
  },
  reveal() {
    this.setData({ revealed: true });
  },
  plan() {
    const b = this.data.post.book;
    if (b)
      wx.navigateTo({
        url:
          "/pages/personal-add/index?book=" +
          encodeURIComponent(b.id) +
          "&kind=book",
      });
  },
  onShow() {
    sharing.enable();
    this.load();
  },
  async read(more) {
    const old = this.data.replies;
    const res = await fetchBookstore("topic", {
      post: this.id,
      after: more && old.length ? old[old.length - 1].id : "",
    });
    this.setData({
      post: res.post,
      replies: more ? old.concat(res.replies) : res.replies,
      more: res.replies.length === 40,
    });
  },
  load() {
    return task(this, () => this.read(false));
  },
  next() {
    return task(this, () => this.read(true));
  },
  edit(e) {
    this.setData({ body: e.detail.value });
  },
  reply() {
    return task(this, async () => {
      await writeBookstore("reply", {
        post: this.id,
        body: this.data.body.trim(),
      });
      this.setData({ body: "" });
      await this.read(false);
      wx.showToast({ title: "已回复" });
    });
  },
});
