function normalizeBase(value, platform) {
  const base = String(value || "").replace(/\/$/, "");
  if (
    platform === "devtools" &&
    /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(base)
  )
    return base;
  if (
    !/^https:\/\/[a-zA-Z0-9.-]+$/.test(base) ||
    /^https:\/\/[\d.]+$/.test(base)
  )
    throw new Error("请配置合法的 HTTPS 后端域名；本地地址仅限开发者工具。");
  return base;
}
function createClient(runtime, config) {
  let cookie = "",
    snapshot = null;
  let epoch = 0, touched = 0, refreshing = null;
  const lists = new Map();
  const reads = new Map(), listeners = new Set();
  let base;
  function invalidateReads() { reads.clear(); }
  function clear() {
    epoch++;
    touched = 0;
    refreshing = null;
    lists.clear();
    cookie = "";
    snapshot = null;
    invalidateReads();
    for (const listener of listeners) listener(epoch);
  }
  function request(path, body, eventTicket) {
    const session = epoch;
    if (!/^\/api\/[a-zA-Z0-9_./-]+(?:\?.*)?$/.test(path))
      return Promise.reject(new Error("无效的接口路径"));
    try {
      base ||= normalizeBase(
        config.baseUrl,
        (runtime.getDeviceInfo?.() || runtime.getSystemInfoSync()).platform,
      );
    } catch (e) {
      return Promise.reject(e);
    }
    if (body !== undefined) invalidateReads();
    return new Promise((resolve, reject) =>
      runtime.request({
        url: base + path,
        method: body === undefined ? "GET" : "POST",
        data: body,
        header: Object.assign(
          { "Content-Type": "application/json", "X-Club-Request": "1", "X-Club-View":"mini" },
          cookie ? { Cookie: cookie } : {},
          eventTicket && path.startsWith("/api/bookstores/gather-") ? {"X-Book-Event-Token":eventTicket} : {},
        ),
        timeout: 120000,
        success(response) {
          if (session !== epoch) return reject(new Error("登录状态已更新，请重新进入页面"));
          if (body !== undefined) invalidateReads();
          const headers = response.header || {};
          const raw = Object.keys(headers)
            .filter((k) => k.toLowerCase() === "set-cookie")
            .map((k) => headers[k])
            .concat(response.cookies || [])
            .join(";");
          const match = raw.match(/(?:^|[;,]\s*)club_session=([A-Za-z0-9_-]*)/);
          if (match) cookie = match[1] ? "club_session=" + match[1] : "";
          if (response.statusCode >= 200 && response.statusCode < 300)
            return resolve(response.data);
          if (response.statusCode === 401 && !eventTicket && path !== "/api/bookstores/gather-login") clear();
          const error = new Error(
            (response.data && response.data.error) || "请求未完成，请重试",
          );
          error.status = response.statusCode;
          reject(error);
        },
        fail() {
          reject(new Error("无法连接服务，请检查后端地址与网络。"));
        },
      }),
    );
  }
  // Only opt-in, read-only views use this short, memory-only session cache.
  function readCached(path, ttl = 30000) {
    if (!cookie) return Promise.reject(Object.assign(new Error("请先微信登录"), {status:401}));
    const saved = reads.get(path);
    if (saved && Date.now() - saved.at < ttl) return saved.promise;
    if (reads.size >= 40) reads.delete(reads.keys().next().value);
    const entry = {at: Date.now()};
    entry.promise = request(path).catch(error => {
      if (reads.get(path) === entry) reads.delete(path);
      throw error;
    });
    reads.set(path, entry);
    return entry.promise;
  }
  function refresh(force = true) {
    if (!force && snapshot && Date.now()-touched < 30000) return Promise.resolve(snapshot);
    if (refreshing) return refreshing;
    const before = snapshot;
    const check = before?.user?.role ? "?since=" + before.revision + "&viewer=" + encodeURIComponent(before.user.id + ":" + before.user.role) : "";
    const pending = request("/api/state"+check).then(data => {
      if (!snapshot || data.revision >= snapshot.revision) {
        snapshot = data.unchanged ? {...snapshot, user:data.user, services:data.services} : data;
      }
      touched = Date.now();
      return snapshot;
    }).finally(() => { if (refreshing === pending) refreshing = null; });
    refreshing = pending;
    return pending;
  }
  function readList(path, body, force = false) {
    const key = path + JSON.stringify(body || {});
    const revision = snapshot?.revision;
    const cached = lists.get(key);
    if (!force && cached && cached.revision === revision && Date.now() - cached.at < 300000) return cached.promise;
    const entry = {revision, at:Date.now()};
    entry.promise = request(path,body).then(data => {
      if (data.unavailable?.length && lists.get(key) === entry) lists.delete(key);
      return data;
    }).catch(error => {
      if (lists.get(key) === entry) lists.delete(key);
      throw error;
    });
    lists.set(key,entry);
    return entry.promise;
  }
  function groupBooks(force = false) {
    return readList("/api/booklists/group", undefined, force);
  }
  async function action(action, payload) {
    if (!snapshot) await refresh();
    try {
      const result = await request("/api/action", {
        revision: snapshot.revision,
        action,
        payload,
      });
      if (!snapshot || result.revision >= snapshot.revision) snapshot = result;
      touched = Date.now();
      return result;
    } catch (error) {
      if (error.status === 409) await refresh();
      throw error;
    }
  }
  return {
    request,
    refresh,
    groupBooks,
    readList,
    readCached,
    invalidateReads,
    onSessionChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    action,
    clear,
    get: () => snapshot,
    hasSession: () => !!cookie,
    sessionGeneration: () => epoch,
    async loginWithWeChat(invite = "") {
      clear();
      const appInfo =
        runtime.getAccountInfoSync && runtime.getAccountInfoSync();
      if (appInfo?.miniProgram?.appId === "touristappid") {
        throw new Error(
          "当前为游客预览，使用正式小程序 AppID 后即可微信登录。",
        );
      }
      const code = await new Promise((resolve, reject) =>
        runtime.login({
          timeout: 10000,
          success: (result) =>
            result.code
              ? resolve(result.code)
              : reject(new Error("微信未返回登录凭据，请重试。")),
          fail: () =>
            reject(
              new Error("微信登录暂不可用，请检查小程序 AppID 或稍后重试。"),
            ),
        }),
      );
      const payload = invite ? { code, invite } : { code };
      await request("/api/wechat/login", payload);
      if (!cookie) throw new Error("登录会话未返回，请重试。");
      return refresh();
    },
    async logout() {
      try {
        await request("/api/logout", {});
      } finally {
        clear();
      }
    },
  };
}
module.exports = { normalizeBase, createClient };
if (typeof wx !== "undefined")
  Object.assign(module.exports, createClient(wx, require("../config")));
