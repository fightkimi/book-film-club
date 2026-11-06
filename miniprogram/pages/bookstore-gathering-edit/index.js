const {
  fetchBookstore,
  writeBookstore,
  task,
} = require("../../lib/bookstore-api");
const { valid } = require("../../lib/gatherings");
function tomorrow() {
  const d = new Date(Date.now() + 86400000 + 8 * 3600000);
  return d.toISOString().slice(0, 10);
}
Page({
  data: {
    busy: false,
    error: "",
    authorized: false,
    title: "",
    description: "",
    place: "",
    capacity: "12",
    date: "",
    time: "15:00",
    blurb: "",
    kind: "meet",
    audience: "readers",
    options: ["微信读者都可参加", "本店圈友"],
    aiReady: false,
  },
  onLoad(q) {
    this.shop = q.shop;
    this.id = valid(q.id) ? q.id : "";
    this.source = !this.id && valid(q.repeat) ? q.repeat : "";
    this.req =
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    this.setData({
      kind: q.kind === "notice" ? "notice" : "meet",
      date: tomorrow(),
      editing: !!this.id,
      repeating: !!this.source,
    });
  },
  onShow() {
    this.load();
  },
  onHide() {
    this.setData({ authorized: false });
  },
  reloadForm() {
    this.loaded = false;
    return this.load();
  },
  load() {
    return task(this, async () => {
      const s = await fetchBookstore("shop", { shop: this.shop });
      if (!s.manage) throw new Error("只有这家店的店主可以操作");
      this.setData({ aiReady: s.event_ai_ready });
      if (this.loaded) return;
      this.setData({ place: s.store.address });
      if (this.id || this.source) {
        const v = await fetchBookstore("gather-detail", {
          event: this.id || this.source,
        });
        if (v.shop !== this.shop || !v.can_manage)
          throw new Error("不能编辑此活动");
        if (this.source && (v.kind !== "meet" || v.state === "deleted"))
          throw new Error("这场活动不能再次发起");
        const [date, time] = v.starts.split(" ");
        this.setData({
          kind: v.kind,
          title: v.title,
          description: v.description,
          blurb: v.blurb,
          place: v.place,
          capacity: String(v.capacity),
          date: this.source ? tomorrow() : date || tomorrow(),
          time: time || "15:00",
          audience: v.audience,
          rev: v.rev,
          sourceRev: this.source ? v.rev : null,
        });
      }
      this.loaded = true;
      wx.setNavigationBarTitle({
        title: this.source
          ? "再约一场"
          : this.data.kind === "notice"
            ? "写张告示"
            : "约一场活动",
      });
    });
  },
  input(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  audience(e) {
    this.setData({ audience: Number(e.detail.value) ? "circle" : "readers" });
  },
  values() {
    const d = this.data;
    return {
      shop: this.shop,
      kind: d.kind,
      audience: d.audience,
      title: d.title.trim(),
      starts: d.date + " " + d.time,
      place: d.place.trim(),
      capacity: Number(d.capacity),
      description: d.description.trim(),
      blurb: d.blurb.trim(),
    };
  },
  generate() {
    return task(this, async () => {
      const r = await writeBookstore("gather-invite-ai", this.values());
      this.setData({
        suggestedIntro: [r.intro, ...r.questions].join("\n\n"),
        suggestedShare: r.share,
      });
    });
  },
  adopt() {
    this.setData({
      description: this.data.suggestedIntro,
      blurb: this.data.suggestedShare,
      suggestedIntro: "",
      suggestedShare: "",
    });
  },
  save() {
    return task(this, async () => {
      const payload = this.values();
      const result = await writeBookstore(
        this.id ? "gather-edit" : this.source ? "gather-repeat" : "gather-new",
        {
          ...payload,
          event: this.id,
          rev: this.data.rev,
          request_id: this.req,
          source: this.source,
          source_rev: this.data.sourceRev,
        },
      );
      if (this.id) wx.navigateBack();
      else
        wx.redirectTo({
          url:
            (payload.kind === "meet"
              ? "/pages/bookstore-gathering-success/index?id="
              : "/pages/bookstore-gathering/index?id=") +
            result.id +
            "&circle=" +
            (payload.audience === "circle" ? "1" : "0"),
        });
    });
  },
});
