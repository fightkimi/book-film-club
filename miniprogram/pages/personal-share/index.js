const P = require("../../lib/personal-api");
const { fetchBookstore } = require("../../lib/bookstore-api");
P.define({
  data: {
    item: null,
    title: "",
    body: "",
    spoiler: false,
    scopes: ["书店树洞（公开）", "我的书店圈"],
    scopeIndex: 0,
    stores: [],
    storeIndex: 0,
    cities: ["全国"],
    cityIndex: 0,
    snippets: [],
    snippetIndex: 0,
  },
  onLoad(q) {
    this.id = q.id;
    this.digest = q.digest || "";
    this.requestId = P.requestId();
  },
  async load() {
    const r = await P.call("item", undefined, { item: this.id });
    const catalog = await fetchBookstore("catalog", { city: "全国" });
    const joined = await P.call("circles");
    let snippets = [];
    if (this.digest) {
      const d = await P.call("digest", undefined, { id: this.digest });
      if (d.item !== this.id) throw new Error("整理与作品不匹配");
      snippets = [
        ...(d.edited ? [{ title: "我的整理稿", text: d.edited }] : []),
        { title: "笔记梳理", text: d.content.summary },
        ...d.content.themes,
        ...d.content.insights,
      ];
    } else if (r.item.reflection)
      snippets = [{ title: "我的书评 / 影评", text: r.item.reflection }];
    this.setData({
      item: r.item,
      stores: joined.stores,
      storeNames: joined.stores.map((s) => s.name),
      cities: ["全国", ...new Set(catalog.stores.map((s) => s.city))],
      snippets,
      snippetNames: snippets.map((s) => s.title),
      ...(!this.dirty
        ? { title: r.item.title.slice(0, 60), spoiler: !!r.item.spoiler }
        : {}),
    });
  },
  scope(e) {
    this.setData({ scopeIndex: Number(e.detail.value) });
  },
  store(e) {
    this.setData({ storeIndex: Number(e.detail.value) });
  },
  city(e) {
    this.setData({ cityIndex: Number(e.detail.value) });
  },
  spoiler(e) {
    this.setData({ spoiler: e.detail.value });
  },
  snippet(e) {
    this.setData({ snippetIndex: Number(e.detail.value) });
  },
  insert() {
    const text = this.data.snippets[this.data.snippetIndex]?.text || "";
    this.dirty = true;
    this.setData({
      body: text.slice(0, 4000),
      error: text.length > 4000 ? "已取前 4000 字，请再选出想分享的段落" : "",
    });
  },
  publish() {
    return P.run(this, async () => {
      const d = this.data;
      const shop = d.scopeIndex ? d.stores[d.storeIndex] : null;
      if (d.scopeIndex && !shop) throw new Error("先到店加入一个书店圈");
      if (
        !(await P.confirm(
          "将当前文字发布到" +
            (shop ? shop.name + "圈内" : "公开的书店树洞") +
            "？",
        ))
      )
        return;
      const r = await P.call("share", {
        item: this.id,
        digest: this.digest,
        request_id: this.requestId,
        title: d.title,
        body: d.body,
        spoiler: d.spoiler,
        scope: shop ? "circle" : "city",
        shop: shop?.id || null,
        city: shop?.city || d.cities[d.cityIndex],
      });
      wx.redirectTo({ url: "/pages/bookstore-topic/index?id=" + r.id });
    });
  },
});
