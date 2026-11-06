const artwork = require("./static-assets");
const api = require("./api");
const sharing = require("./sharing");
const {retain} = require("./page-lifecycle");
const images = require("./store-images");
const imageBase = require("../config").baseUrl + "/mini-assets/v161/bookstores/v181/";
const prefix = "/api/bookstores/";
const packagedPhotos = {
  "https://www.nationalreading.gov.cn/ydkj/swsh/202603/W020260323583992118074.png":
    artwork.lekaiOne,
  "https://www.nationalreading.gov.cn/ydkj/swsh/202603/W020260323583992295939.png":
    artwork.lekaiTwo,
  "https://www.cbbr.com.cn/upload/images/2026/8/f5f9c300f46d8d33.png":
    artwork.potatoOne,
  "https://www.cbbr.com.cn/upload/images/2026/8/3ab97b7af622639f.png":
    artwork.potatoTwo,
};
function withPhotos(shop) {
  return {
    ...shop,
    thumbnail: images[shop.photos[0]?.[0]] ? imageBase + images[shop.photos[0][0]][0] : packagedPhotos[shop.photos[0]?.[0]] || shop.photos[0]?.[0] || "",
    displayPhotos: shop.photos.map(([url]) => images[url] ? imageBase + images[url][1] : packagedPhotos[url] || url),
    photos: shop.photos.map(([url, caption, credit]) => [
      packagedPhotos[url] || url,
      caption,
      credit,
    ]),
  };
}
async function fetchBookstore(op, params = {}) {
  const entries = Object.keys(params).filter(
    (k) => params[k] !== undefined && params[k] !== "",
  );
  const query = entries
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
    .join("&");
  const path = prefix + op + (query ? "?" + query : "");
  const data = await (["catalog", "following", "feed"].includes(op)
    ? api.readCached(path) : api.request(path));
  if (op === "catalog")
    return {
      ...data,
      stores: data.stores.map((s) => ({
        ...withPhotos(s),
        following: (data.followed || []).includes(s.id),
      })),
    };
  if (op === "following")
    return {
      ...data,
      stores: data.stores.map((s) => ({ ...withPhotos(s), following: true })),
    };
  if (op === "shop") return { ...data, store: withPhotos(data.store) };
  return data;
}
async function directory() {
  return (await fetchBookstore("catalog", { city: "全国" })).stores;
}
function writeBookstore(op, body) {
  return api.request(prefix + op, body);
}
function requireLogin(page) {
  page.setData({ authorized: false, error: "" });
  wx.reLaunch({ url: "/pages/login/index?next=tree" });
}
async function task(page, work) {
  if (!api.hasSession()) return requireLogin(page);
  if (page.data.busy) return;
  const generation = api.sessionGeneration();
  page.setData({ busy: true, error: "" });
  try {
    await work();
    if (!page._gone && generation === api.sessionGeneration() && api.hasSession()) { page.setData({ authorized: true }); sharing.schedule(page); }
  } catch (e) {
    if (generation !== api.sessionGeneration() && api.hasSession()) return;
    if (e.status === 401 || !api.hasSession()) return requireLogin(page);
    if (e.status === 403 || e.status === 404) page.setData({authorized: false});
    page.setData({ error: e.message || "请求失败，请重试" });
  } finally {
    page.setData({ busy: false });
  }
}
module.exports = {
  define(options) { Page(retain({
    async onPullDownRefresh() {
      api.invalidateReads();
      try { await this.load(); } finally { wx.stopPullDownRefresh(); }
    },
    ...options,
  })); },
  withPhotos,
  directory,
  fetchBookstore,
  writeBookstore,
  task,
};
