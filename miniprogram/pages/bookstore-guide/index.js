const { directory, task, writeBookstore } = require("../../lib/bookstore-api");
Page({
  data: {
    stores: [],
    visible: [],
    areas: [],
    area: "全城",
    cities: [],
    city: "全国",
    busy: false,
    error: "",
  },
  onLoad(q) {
    this.startCity = q.city;
  },
  onHide() {
    this.setData({ authorized: false });
  },
  onShow() {
    this.load();
  },
  load() {
    return task(this, async () => {
      const stores = (await directory()).map((s) => ({
        ...s,
        district: s.area.split("　")[0],
      }));
      const cities = ["全国", ...new Set(stores.map((s) => s.city))];
      const previous = this.data.cities.length
        ? this.data.city
        : this.startCity || wx.getStorageSync("bookstore-city");
      this.setData({ stores, cities });
      this.showCity(cities.includes(previous) ? previous : "全国");
    });
  },
  follow(e) {
    return task(this, async () => {
      const id = e.currentTarget.dataset.id;
      const store = this.data.stores.find((s) => s.id === id);
      if (!store) return;
      const r = await writeBookstore("follow", {
        shop: id,
        enabled: !store.following,
      });
      const patch = (items) =>
        items.map((s) => (s.id === id ? { ...s, following: r.following } : s));
      this.setData({
        stores: patch(this.data.stores),
        visible: patch(this.data.visible),
      });
    });
  },
  showCity(city) {
    const visible = this.data.stores.filter(
      (s) => city === "全国" || s.city === city,
    );
    const areas =
      city === "全国"
        ? []
        : ["全城", ...new Set(visible.map((s) => s.area.split("　")[0]))];
    this.setData({
      city,
      cityIndex: this.data.cities.indexOf(city),
      visible,
      area: "全城",
      areas,
    });
  },
  pickCity(e) {
    const city = this.data.cities[e.detail.value];
    this.showCity(city);
    wx.setStorageSync("bookstore-city", city);
  },
  filter(e) {
    const area = e.currentTarget.dataset.area;
    this.setData({
      area,
      visible: this.data.stores.filter(
        (s) =>
          s.city === this.data.city &&
          (area === "全城" || s.area.split("　")[0] === area),
      ),
    });
  },
});
