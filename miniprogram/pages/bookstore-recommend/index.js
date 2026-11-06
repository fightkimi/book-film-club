const artwork = require("../../lib/static-assets");
const {
  directory,
  fetchBookstore,
  writeBookstore,
  task,
} = require("../../lib/bookstore-api");
Page({
  data: {
    scene:artwork.paterson,
    authorized: false,
    busy: false,
    error: "",
    books: [],
    book: null,
    bookIndex: 0,
    stores: [],
    storeIndex: 0,
    body: "",
    count: 0,
    partial: false,
  },
  onLoad(q) {
    this.preferredShop = q.shop || "";
    this.preferredBook = q.book || "";
    this.city = q.city || "全国";
    this.req =
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  },
  onHide() {
    this.setData({ authorized: false });
  },
  onShow() {
    this.load();
  },
  load() {
    return task(this, async () => {
      const [catalog, result] = await Promise.all([
        directory(),
        fetchBookstore("recommend-books"),
      ]);
      const selected = this.data.book?.id || this.preferredBook;
      const chosenShop =
        this.data.stores[this.data.storeIndex]?.id || this.preferredShop;
      const books = result.books.map((b) => ({
        ...b,
        label: b.title + (b.creator ? "　" + b.creator : ""),
      }));
      const stores = [
        { id: "", name: "不关联书店" },
        ...catalog.map((s) => ({ ...s, label: s.name + "　" + s.city })),
      ];
      stores[0].label = stores[0].name;
      const bookIndex = Math.max(
        0,
        books.findIndex((b) => b.id === selected),
      );
      this.setData({
        books,
        bookIndex,
        book: books[bookIndex] || null,
        stores,
        storeIndex: Math.max(
          0,
          stores.findIndex((s) => s.id === chosenShop),
        ),
        partial: result.partial,
      });
      if (!["全国", ...catalog.map((s) => s.city)].includes(this.city))
        this.city = "全国";
    });
  },
  choose(e) {
    const bookIndex = Number(e.detail.value);
    this.setData({ bookIndex, book: this.data.books[bookIndex] });
  },
  store(e) {
    this.setData({ storeIndex: Number(e.detail.value) });
  },
  edit(e) {
    this.setData({
      body: e.detail.value,
      count: Array.from(e.detail.value).length,
    });
  },
  publish() {
    return task(this, async () => {
      if (!this.data.book || !this.data.body.trim())
        throw new Error("选一本书，写一句推荐理由");
      const shop = this.data.stores[this.data.storeIndex];
      const result = await writeBookstore("recommend", {
        book_id: this.data.book.id,
        body: this.data.body.trim(),
        shop: shop?.id || "",
        city: shop?.city || this.city,
        request_id: this.req,
      });
      this.setData({ body: "", count: 0 });
      wx.showToast({ title: "已发布" });
      wx.switchTab({ url: "/pages/bookstores/index" });
      return result;
    });
  },
});
