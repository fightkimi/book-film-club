const api = require("./api");
const { go, confirm } = require("./page");
function call(op, data, params = {}) {
  const query = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
    .join("&");
  return api.request(
    "/api/bookstores/personal/" + op + (query ? "?" + query : ""),
    data,
  );
}
function login(page) {
  page.setData({ authorized: false });
  wx.reLaunch({ url: "/pages/login/index?next=library" });
}
async function run(page, work) {
  if (!api.hasSession()) return login(page);
  if (page.data.busy) return;
  page.setData({ busy: true, error: "" });
  try {
    const result = await work();
    if (!page._gone && api.hasSession()) page.setData({ authorized: true });
    return result;
  } catch (e) {
    if (e.status === 401 || !api.hasSession()) return login(page);
    if (!page._gone)
      page.setData({ error: e.message || "暂时无法完成，请重试" });
  } finally {
    if (!page._gone) page.setData({ busy: false });
  }
}
function define(options) {
  Page({
    ...options,
    data: { authorized: false, busy: false, error: "", ...options.data },
    onLoad(q) {
      this.q = q || {};
      this._gone = false;
      options.onLoad?.call(this, this.q);
    },
    onShow() {
      this.getTabBar?.()?.selectPage(this.route);
      this.load();
    },
    onHide() {
      this.setData({ authorized: false });
      options.onHide?.call(this);
    },
    onUnload() {
      this._gone = true;
    },
    load() {
      return run(this, () => options.load.call(this));
    },
    input(e) {
      this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
      this.dirty = true;
    },
  });
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
