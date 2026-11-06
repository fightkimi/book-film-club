const P = require("../../lib/personal-api");
function plain(content) {
  return [
    content.summary,
    ...content.themes.map((s) => s.title + "\n" + s.text),
    ...content.insights.map((s) => s.title + "\n" + s.text),
    ...content.questions,
  ]
    .filter(Boolean)
    .join("\n\n");
}
P.define({
  data: { result: null, editing: false, edited: "", source: null },
  onLoad(q) {
    this.id = q.id;
  },
  async load() {
    const r = await P.call("digest", undefined, { id: this.id });
    this.setData({
      result: r,
      ...(!this.dirty ? { edited: r.edited || plain(r.content) } : {}),
    });
    if (!this.dirty) this.rev = r.rev;
  },
  original() {
    this.setData({ showOriginal: !this.data.showOriginal });
  },
  edit() {
    this.setData({ editing: !this.data.editing });
  },
  evidence(e) {
    this.setData({
      source:
        this.data.result.sources.find(
          (n) => n.id === e.currentTarget.dataset.id,
        ) || null,
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },
  closeSource() {
    this.setData({ source: null });
  },
  save() {
    return P.run(this, async () => {
      const r = await P.call("digest-save", {
        id: this.id,
        rev: this.rev,
        edited: this.data.edited,
      });
      this.dirty = false;
      this.rev = r.rev;
      this.setData({ result: r, editing: false });
      wx.showToast({ title: "已保存" });
    });
  },
  share() {
    if (this.dirty) {
      this.setData({ error: "先保存修改，再选取分享内容" });
      return;
    }
    P.go("personal-share", { id: this.data.result.item, digest: this.id });
  },
});
