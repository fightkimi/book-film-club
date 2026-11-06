const sharing = require("../../lib/sharing");
const api = require("../../lib/api");
const eventApi = require("../../lib/gatherings");
const { confirm } = require("../../lib/page");
Page(require("../../lib/page-lifecycle").retain({
  data: {
    busy: false,
    error: "",
    authorized: false,
    nickname: "",
    note: "",
    allow: false,
    hostNotes: "",
    recapDraft: "",
    editingRecap: false,
  },
  onLoad(q) {
    this.id = eventApi.valid(q.id) ? q.id : "";
    this.circle = q.circle === "1";
  },
  onShow() {
    sharing.enable();
    this.load();
  },
  async action(work) {
    if (this.data.busy) return;
    if (!this.id) {
      this.setData({ error: "这张活动卡片无效" });
      return;
    }
    if (!api.hasSession() && !eventApi.has(this.id)) {
      eventApi.loginPage(this.id, this.circle);
      return;
    }
    this.setData({ busy: true, error: "" });
    try {
      await work();
      this.setData({ authorized: true });
    } catch (e) {
      if (e.status === 403 || e.status === 404) this.setData({authorized: false});
      if (e.status === 401) {
        this.setData({ authorized: false });
        eventApi.loginPage(this.id, this.circle);
      } else {
        if (e.status === 409) {
          try { await this.refresh(); } catch (_) { /* Keep the original action error visible. */ }
        }
        const message = e.message || "请稍后重试";
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none", duration: 3500 });
      }
    } finally {
      this.setData({ busy: false });
    }
  },
  async refresh() {
    let v = await eventApi.call("detail", this.id);
    if (v.state !== "deleted" && v.kind === "meet" && api.hasSession() && !eventApi.has(this.id)) {
      await this.identity();
      v = await eventApi.call("detail", this.id);
    }
    this.circle = v.audience === "circle";
    const patch = {
      v,
      note: v.my_note || "",
      allow: !!v.allow_recap,
      nickname: v.nickname || this.data.nickname || "",
    };
    if (!this.data.editingRecap) {
      patch.recapDraft = v.recap || "";
      patch.draftRev = v.rev;
      patch.materialRev = v.notes_rev;
    }
    this.setData(patch);
    sharing.enable(); sharing.schedule(this);
    wx.setNavigationBarTitle({
      title: v.state === "deleted" ? v.title : v.kind === "notice" ? "书店告示" : "店里有约",
    });
    if (v.state === "deleted") wx.hideShareMenu();
  },
  load() {
    return this.action(() => this.refresh());
  },
  input(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
    if (e.currentTarget.dataset.key === "recapDraft")
      this.setData({ editingRecap: true });
  },
  consent(e) {
    this.setData({ allow: e.detail.value.length > 0 });
  },
  async identity() {
    if (!eventApi.has(this.id)) await eventApi.verify(this.id);
  },
  rsvp(e) {
    return this.action(async () => {
      await this.identity();
      const op = e.currentTarget.dataset.op;
      await eventApi.call(op, this.id, { nickname: this.data.nickname });
      await this.refresh();
      wx.showToast({ title: op === "sign" ? "已给你留座" : "已取消报名" });
    });
  },
  note() {
    return this.action(async () => {
      await this.identity();
      await eventApi.call("note", this.id, {
        note: this.data.note,
        allow_recap: this.data.allow,
      });
      await this.refresh();
      wx.showToast({ title: "已保存" });
    });
  },
  state(e) {
    return this.action(async () => {
      const op = e.currentTarget.dataset.op;
      const notice = this.data.v.kind === "notice";
      const copy = op === "end"
        ? {title: "散场了？", content: "结束后停止报名，书友可以留下感想。", confirmText: "散场了", cancelText: "还没呢"}
        : op === "delete"
          ? {title: notice ? "删除这张告示？" : "删除这场活动？", content: "将从书店列表移除，已分享的卡片打开后会显示已删除。", confirmText: "删除", cancelText: "保留"}
          : {title: notice ? "撤下这张告示？" : "这场先取消？", content: notice ? "打开已分享的卡片会显示已撤下。" : "将停止报名，打开已分享的卡片会显示已取消。", confirmText: notice ? "撤下告示" : "取消活动", cancelText: "再想想"};
      if (
        !(await confirm(copy.content, copy))
      )
        return;
      await eventApi.call(op, this.id, { rev: this.data.v.rev });
      await this.refresh();
      wx.showToast({ title: op === "end" ? "已散场" : op === "delete" ? "已删除" : notice ? "已撤下" : "已取消", icon: "success" });
    });
  },
  generateRecap() {
    return this.action(async () => {
      const out = await eventApi.call("recap-ai", this.id, {
        notes: this.data.hostNotes,
      });
      this.setData({
        suggestion: out.recap,
        aiRev: out.rev,
        aiMaterial: out.notes_rev,
      });
    });
  },
  adopt() {
    this.setData({
      recapDraft: this.data.suggestion,
      editingRecap: true,
      draftRev: this.data.aiRev,
      materialRev: this.data.aiMaterial,
      suggestion: "",
    });
  },
  publishRecap() {
    return this.action(async () => {
      if (!(await confirm("让这场活动的读者看到这篇回顾？"))) return;
      await eventApi.call("save-recap", this.id, {
        recap: this.data.recapDraft,
        rev: this.data.draftRev,
        notes_rev: this.data.materialRev,
      });
      this.setData({ editingRecap: false, suggestion: "" });
      await this.refresh();
    });
  },
  resetDraft() {
    this.setData({ editingRecap: false, suggestion: "" });
    this.load();
  },
  copy() {
    const v = this.data.v;
    wx.setClipboardData({
      data: [
        v.state === "cancelled" ? "已取消" : v.shop_name,
        v.title,
        v.starts,
        v.place,
        v.kind === "meet" ? v.capacity + " 个名额" : "",
        v.recap || v.blurb || v.description,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  },
  onShareAppMessage: sharing.message,
}));
