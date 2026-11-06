const api = require("./api");
const { go, confirm } = require("./page");
const sharing = require("./sharing");
const {retain} = require("./page-lifecycle");
const {coverThumbnail} = require("./poster-url");
function call(op, data, params = {}) {
  const query = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
    .join("&");
  const path = "/api/bookstores/personal/" + op + (query ? "?" + query : "");
  return data === undefined && ["list", "item", "notes", "connection", "catalog"].includes(op)
    ? api.readCached(path) : api.request(path, data);
}
function login(page) {
  page.setData({ authorized: false });
  wx.reLaunch({ url: "/pages/login/index?next=library" });
}
async function run(page, work) {
  if (!api.hasSession()) return login(page);
  if (page.data.busy) return;
  const generation = api.sessionGeneration();
  page.setData({ busy: true, error: "" });
  try {
    const result = await work();
    if (!page._gone && generation === api.sessionGeneration() && api.hasSession()) page.setData({ authorized: true });
    return result;
  } catch (e) {
    if (generation !== api.sessionGeneration() && api.hasSession()) return;
    if (e.status === 401 || !api.hasSession()) return login(page);
    if (e.status === 403 || e.status === 404) page.setData({authorized: false});
    if (!page._gone)
      page.setData({ error: e.message || "暂时无法完成，请重试" });
  } finally {
    if (!page._gone) page.setData({ busy: false });
  }
}
function define(options) {
  Page(retain({
    ...options,
    onShareAppMessage: sharing.message,
    data: { authorized: false, busy: false, error: "", ...options.data },
    onLoad(q) {
      this.q = sharing.decodeQuery(q || {});
      this._gone = false;
      options.onLoad?.call(this, this.q);
    },
    onShow() {
      sharing.enable?.();
      this.getTabBar?.()?.selectPage(this.route);
      this.load();
    },
    onHide() {
      options.onHide?.call(this);
    },
    onUnload() {
      this._gone = true;
    },
    load() {
      return run(this, async () => { await options.load.call(this); sharing.schedule(this); });
    },
    async onPullDownRefresh() {
      api.invalidateReads();
      try { await this.load(); } finally { wx.stopPullDownRefresh(); }
    },
    input(e) {
      this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
      this.dirty = true;
    },
  }));
}
const currentMonth = () =>
  new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);
const today = () =>
  new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const requestId = () =>
  Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
function present(row) {
  return {
    ...row,
    thumbnail: coverThumbnail(row.image),
    statusLabel: {
      wish: row.kind === "movie" ? "想看" : "想读",
      reading: row.kind === "movie" ? "在看" : "在读",
      done: row.kind === "movie" ? "看过" : "读完",
      paused: "暂放",
    }[row.status],
    kindLabel: row.kind === "movie" ? "电影" : "书籍",
  };
}
module.exports = {
  call,
  run,
  define,
  go,
  confirm,
  currentMonth,
  today,
  requestId,
  present,
};
