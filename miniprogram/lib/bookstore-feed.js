const {
  directory,
  fetchBookstore,
  writeBookstore,
  task,
} = require("./bookstore-api");
const sharing = require("./sharing");
module.exports = function forumPage(home) {
  return require("./page-lifecycle").retain({
    onShareAppMessage: sharing.message,
    data: {
      home,
      name: home ? "书店树洞" : "本店读者圈",
      busy: false,
      error: "",
      posts: [],
      more: false,
      compose: false,
      kind: 0,
      kinds: ["逛店手记", "问本地人"],
      stores: [],
      storeIndex: 0,
      title: "",
      body: "",
      shop: "",
      city: "全国",
      cities: [],
      cityIndex: 0,
    },
    onLoad(q) {
      q = sharing.decodeQuery(q);
      this.setData({
        shop: home ? "" : q.shop || "",
        city: home ? "全国" : q.city || "全国",
      });
    },
    onShow() {
      if (home) this.getTabBar?.()?.selectPage(this.route);
      this.load();
    },
    async onPullDownRefresh() {
      require("./api").invalidateReads();
      try { await this.load(); } finally { wx.stopPullDownRefresh(); }
    },
    async feed(more) {
      const { shop, posts, city } = this.data;
      const q = { scope: shop ? "circle" : "city", shop, city };
      if (more && posts.length) q.before = posts[posts.length - 1].id;
      const page = await fetchBookstore("feed", q);
      this.setData({
        posts: more ? posts.concat(page.posts) : page.posts,
        more: page.posts.length === 30,
      });
    },
    load() {
      return task(this, async () => {
        const catalog = await directory();
        const shop = catalog.find((s) => s.id === this.data.shop);
        const name = shop ? shop.name + "读者圈" : "书店树洞";
        this.catalog = catalog;
        const cities = ["全国", ...new Set(catalog.map((s) => s.city))];
        const city = shop
          ? shop.city
          : cities.includes(this.data.city)
            ? this.data.city
            : "全国";
        this.setData({ name, cities });
        this.showCity(city);
        wx.setNavigationBarTitle({ title: name });
        await this.feed(false);
      });
    },
    showCity(city) {
      const selected = this.data.stores[this.data.storeIndex]?.id;
      const stores = [
        { id: "", name: "不关联书店" },
        ...this.catalog.filter((s) => city === "全国" || s.city === city),
      ];
      this.setData({
        city,
        cityIndex: this.data.cities.indexOf(city),
        stores,
        storeIndex: Math.max(
          0,
          stores.findIndex((s) => s.id === selected),
        ),
      });
    },
    changeCity(e) {
      return task(this, async () => {
        this.showCity(this.data.cities[e.detail.value]);
        this.setData({ posts: [], more: false });
        await this.feed(false);
      });
    },
    next() {
      return task(this, () => this.feed(true));
    },
    compose() {
      return task(this, async () => {
        this.setData({ compose: !this.data.compose });
      });
    },
    recommend() {
      return task(this, async () => {
        wx.navigateTo({
          url:
            "/pages/bookstore-recommend/index?shop=" +
            encodeURIComponent(this.data.shop || "") +
            "&city=" +
            encodeURIComponent(this.data.city),
        });
      });
    },
    edit(e) {
      this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
    },
    pick(e) {
      this.setData({ [e.currentTarget.dataset.key]: Number(e.detail.value) });
    },
    submit() {
      return task(this, async () => {
        const d = this.data;
        const post = await writeBookstore("post", {
          scope: d.shop ? "circle" : "city",
          city: d.city,
          shop: d.shop || d.stores[d.storeIndex].id,
          kind: d.kinds[d.kind],
          title: d.title.trim(),
          body: d.body.trim(),
        });
        this.setData({ compose: false, title: "", body: "" });
        wx.navigateTo({ url: "/pages/bookstore-topic/index?id=" + post.id });
      });
    },
  });
};
