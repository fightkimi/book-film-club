const api = require("./api");
const tickets = new Map();
const valid = (id) => typeof id === "string" && /^[0-9a-f]{24}$/.test(id);
function ticket(id) {
  const saved = tickets.get(id);
  return saved && saved.generation === api.sessionGeneration()
    ? saved.token
    : "";
}
async function verify(id) {
  if (!valid(id)) throw new Error("活动卡片有误");
  const code = await new Promise((resolve, reject) =>
    wx.login({
      timeout: 10000,
      success: (r) =>
        r.code ? resolve(r.code) : reject(new Error("请重新微信登录")),
      fail: () => reject(new Error("暂时无法微信登录")),
    }),
  );
  const r = await api.request("/api/bookstores/gather-login", {
    event: id,
    code,
  });
  tickets.set(id, {
    token: r.event_token,
    generation: api.sessionGeneration(),
  });
}
async function call(op, id, data) {
  const detail = op === "detail";
  const url =
    "/api/bookstores/gather-" +
    op +
    (detail ? "?event=" + encodeURIComponent(id) : "");
  try {
    return await api.request(
      url,
      detail ? undefined : { ...data, event: id },
      ticket(id),
    );
  } catch (e) {
    if (e.status === 401) tickets.delete(id);
    throw e;
  }
}
function loginPage(id, circle) {
  wx.reLaunch({
    url: "/pages/login/index?event=" + id + "&circle=" + (circle ? "1" : "0"),
  });
}
module.exports = { valid, verify, call, loginPage, has: (id) => !!ticket(id) };
