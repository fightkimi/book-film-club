const sharing = require("../../lib/sharing");
const {
  fetchBookstore,
  writeBookstore,
  task,
} = require("../../lib/bookstore-api");
const { confirm } = require("../../lib/page");
const board = require("../../lib/static-assets").board;
require("../../lib/bookstore-api").define({
  onShareAppMessage: sharing.message,
  data: {
    busy: false,
    error: "",
    code: "",
    issued: "",
    body: "",
    pin: "",
    managing: false,
    pinDirty: false,
    voice: "",
    voiceDirty: false,
    panel: "",
    board,
  },
  onLoad(q) {
    this.id = q.id;
    this.setData({ managing: q.view === "manage" });
  },
  onShow() {
    sharing.enable();
    this.load();
  },
  async refresh() {
    const data = await fetchBookstore("shop", { shop: this.id });
    if (this.data.managing && !data.manage) {
      this.setData({ authorized: false, manage: false });
      throw new Error("本页仅供本店管理者使用");
    }
    this.setData({
      ...data,
      online: true,
      claims: data.claims || [],
      pin: this.data.pinDirty ? this.data.pin : data.pinned || "",
      voice: this.data.voiceDirty ? this.data.voice : data.voice || "",
    });
    wx.setNavigationBarTitle({
      title: this.data.managing ? "店主管理" : data.store.name,
    });
  },
  load() {
    return task(this, () => this.refresh());
  },
  edit(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({
      [key]: e.detail.value,
      ...(key === "pin" ? { pinDirty: true } : {}),
      ...(key === "voice" ? { voiceDirty: true } : {}),
    });
  },
  togglePanel(e) {
    const id = e.currentTarget.dataset.panel;
    this.setData({ panel: this.data.panel === id ? "" : id });
  },
  follow() {
    return task(this, async () => {
      const r = await writeBookstore("follow", {
        shop: this.id,
        enabled: !this.data.following,
      });
      this.setData({ following: r.following });
      wx.showToast({
        title: r.following ? "已关注" : "已取消关注",
        icon: "none",
      });
    });
  },
  copy(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.value });
  },
  photo(e) {
    const src = e.currentTarget.dataset.src;
    wx.previewImage({
      current: src,
      urls: src === board ? [board] : this.data.store.photos.map((p) => p[0]),
    });
  },
  photoError(e) {
    const i = e.currentTarget.dataset.index;
    const original = this.data.store.photos[i]?.[0];
    if (original && this.data.store.displayPhotos[i] !== original)
      this.setData({["store.displayPhotos[" + i + "]"]: original});
  },
  act(e) {
    return task(this, async () => {
      const { op, reader, name } = e.currentTarget.dataset;
      const body = { shop: this.id };
      if (op === "approve") {
        if (
          !(await confirm(
            "已核实「" + name + "」是本店经营者，授予本店管理权？",
          ))
        )
          return;
        body.reader = reader;
      }
      if (op === "claim" && !(await confirm("以当前成员身份申请管理本店？")))
        return;
      if (op === "join") body.code = this.data.code.trim();
      if (op === "arrival") body.body = this.data.body.trim();
      if (op === "pin") body.body = this.data.pin.trim();
      if (op === "voice") {
        body.body = this.data.voice.trim();
        body.voice_rev = this.data.voice_rev;
      }
      const result = await writeBookstore(op, body);
      this.setData({
        issued: result.code || this.data.issued,
        pinDirty: op === "pin" ? false : this.data.pinDirty,
        voiceDirty: op === "voice" ? false : this.data.voiceDirty,
        code: "",
        body: op === "arrival" ? "" : this.data.body,
      });
      await this.refresh();
      wx.showToast({
        title: op === "join" ? "已入圈" : op === "claim" ? "已申请" : "已完成",
        icon: "success",
      });
    });
  },
});
