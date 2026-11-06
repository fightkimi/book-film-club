const api = require("./api");
const sharing = require("./sharing");
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
    onShareAppMessage: options.onShareAppMessage || sharing.message,
    data: Object.assign(
      { busy: false, error: "", notice: "" },
      options.data || {},
    ),
    onLoad(query) {
      this.query = sharing.decodeQuery(query || {});
      this._gone = false;
      if (options.onLoad) options.onLoad.call(this, this.query);
    },
    onUnload() {
      this._gone = true;
      if (this.timer) clearTimeout(this.timer);
      if (options.onUnload) options.onUnload.call(this);
    },
    async onShow() {
      sharing.enable();
      const bar = this.getTabBar?.();
      if (bar) bar.selectPage(this.route);
      if (!api.hasSession()) {
        wx.reLaunch({ url: "/pages/login/index" });
        return;
      }
      await this.load();
    },
    async load(force = false) {
      return run(this, async () => {
        const data = await api.refresh(force);
        if (this._gone) return;
        this.setData({
          user: data.user,
          services: data.services,
          isAdmin: data.user.role === "admin",
          canDrawTheme: data.user.can_draw_theme ?? (data.user.role === "admin"),
          canCreateTheme: data.user.can_create_theme ?? (data.user.role === "admin"),
          canStartActivity: data.user.can_start_activity ?? ["admin", "organizer"].includes(data.user.role),
        });
        if (options.ready) await options.ready.call(this, data, force);
        sharing.prepare(this);
      });
    },
    async onPullDownRefresh() {
      try {
        await this.load(true);
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
function confirm(content, options = {}) {
  return new Promise((resolve) =>
    wx.showModal({
      title: options.title || "请确认",
      content,
      confirmText: options.confirmText || "确定",
      cancelText: options.cancelText || "取消",
      confirmColor: "#252525",
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    }),
  );
}
module.exports = { api, define, run, go, confirm };
