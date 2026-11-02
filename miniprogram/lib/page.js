const api = require("./api");
function fail(page, error) {
  page.setData({ error: error.message || "暂时无法完成操作" });
  if (error.status === 401) wx.reLaunch({ url: "/pages/login/index" });
}
async function run(page, fn) {
  if (page.data.busy) return;
  page.setData({ busy: true, error: "", notice: "" });
  try {
    return await fn();
  } catch (e) {
    fail(page, e);
  } finally {
    if (!page._gone) page.setData({ busy: false });
  }
}
function go(page, params) {
  const query = Object.keys(params || {})
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
    .join("&");
  wx.navigateTo({
    url: "/pages/" + page + "/index" + (query ? "?" + query : ""),
  });
}
function define(options) {
  const config = Object.assign({}, options, {
    data: Object.assign(
      { busy: false, error: "", notice: "" },
      options.data || {},
    ),
    onLoad(query) {
      this.query = query || {};
      this._gone = false;
      if (options.onLoad) options.onLoad.call(this, query || {});
    },
    onUnload() {
      this._gone = true;
      if (this.timer) clearTimeout(this.timer);
      if (options.onUnload) options.onUnload.call(this);
    },
    async onShow() {
      if (!api.hasSession()) {
        wx.reLaunch({ url: "/pages/login/index" });
        return;
      }
      await this.load();
    },
    async load() {
      return run(this, async () => {
        const data = await api.refresh();
        this.setData({
          user: data.user,
          services: data.services,
          isAdmin: data.user.role === "admin",
        });
        if (options.ready) await options.ready.call(this, data);
      });
    },
    async onPullDownRefresh() {
      try {
        await this.load();
      } finally {
        wx.stopPullDownRefresh();
      }
    },
    input(e) {
      this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
    },
    toggle(e) {
      this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
    },
    clearError() {
      this.setData({ error: "" });
    },
    open(e) {
      go(e.currentTarget.dataset.page, {
        id: e.currentTarget.dataset.id || "",
      });
    },
  });
  delete config.ready;
  Page(config);
}
function confirm(content) {
  return new Promise((resolve) =>
    wx.showModal({
      title: "请确认",
      content,
      confirmColor: "#252525",
      success: (r) => resolve(r.confirm),
    }),
  );
}
module.exports = { api, define, run, go, confirm };
