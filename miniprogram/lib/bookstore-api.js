const artwork = require("./static-assets");
const api = require("./api");
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
  const data = await api.request(prefix + op + (query ? "?" + query : ""));
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
  page.setData({ busy: true, error: "" });
  try {
    await work();
    if (api.hasSession()) page.setData({ authorized: true });
  } catch (e) {
    if (e.status === 401 || !api.hasSession()) return requireLogin(page);
    page.setData({ error: e.message || "请求失败，请重试" });
  } finally {
    page.setData({ busy: false });
  }
}
module.exports = {
  directory,
  fetchBookstore,
  writeBookstore,
  task,
};
