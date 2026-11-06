const sharing = require("../../lib/sharing");
const { directory, task, writeBookstore } = require("../../lib/bookstore-api");
require("../../lib/bookstore-api").define({
  onShareAppMessage: sharing.message,
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
    q = sharing.decodeQuery(q);
    this.startCity = q.city;
  },
  onShow() {
    sharing.enable();
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
      const area = this.data.area;
      this.setData({ stores, cities });
      this.showCity(cities.includes(previous) ? previous : "全国");
      if (area !== "全城" && this.data.areas.includes(area))
        this.filter({currentTarget:{dataset:{area}}});
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
  photoError(e) {
    const i = e.currentTarget.dataset.index, row = this.data.visible[i];
    if (row?.id === e.currentTarget.dataset.id && row.thumbnail !== row.photos[0]?.[0])
      this.setData({["visible[" + i + "].thumbnail"]: row.photos[0][0]});
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
