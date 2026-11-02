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
  function clear() {
    cookie = "";
    snapshot = null;
  }
  function request(path, body) {
    if (!/^\/api\/[a-zA-Z0-9_./-]+(?:\?.*)?$/.test(path))
      return Promise.reject(new Error("无效的接口路径"));
    let base;
    try {
      base = normalizeBase(
        config.baseUrl,
        runtime.getSystemInfoSync().platform,
      );
    } catch (e) {
      return Promise.reject(e);
    }
    return new Promise((resolve, reject) =>
      runtime.request({
        url: base + path,
        method: body === undefined ? "GET" : "POST",
        data: body,
        header: Object.assign(
          { "Content-Type": "application/json", "X-Club-Request": "1" },
          cookie ? { Cookie: cookie } : {},
        ),
        timeout: 120000,
        success(response) {
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
          if (response.statusCode === 401) clear();
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
  async function refresh() {
    snapshot = await request("/api/state");
    return snapshot;
  }
  async function action(action, payload) {
    if (!snapshot) await refresh();
    try {
      const result = await request("/api/action", {
        revision: snapshot.revision,
        action,
        payload,
      });
      snapshot = result;
      return result;
    } catch (error) {
      if (error.status === 409) await refresh();
      throw error;
    }
  }
  return {
    request,
    refresh,
    action,
    clear,
    asset(path) {
      if (!/^\/assets\/themes\/[a-z-]+\.jpg$/.test(path))
        throw new Error("图片路径无效");
      return (
        normalizeBase(config.baseUrl, runtime.getSystemInfoSync().platform) +
        path
      );
    },
    get: () => snapshot,
    hasSession: () => !!cookie,
    async login(username, credential) {
      await request("/api/login", { username, credential });
      if (!cookie) throw new Error("登录会话未返回，请检查服务配置");
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
