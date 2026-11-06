const api = require("./api");
const { labels } = require("./data");

function merge(state, user, events, stamp = new Date().toISOString()) {
  const now = new Date(stamp).getTime();
  const time = (value, end = false) =>
    new Date(
      value.length === 10
        ? value + (end ? "T23:59:59" : "T00:00:00") + "+08:00"
        : value.replace(" ", "T") + "+08:00",
    ).getTime();
  const rows = [];
  for (const c of state.cycles || []) {
    const member = c.participants?.[user.id];
    if (!member) continue;
    const inactive = member.status !== "joined";
    const past =
      inactive ||
      ["closed", "archived"].includes(c.status) ||
      time(c.end, true) < now;
    rows.push({
      key: "club:" + c.id,
      id: c.id,
      source: "club",
      type: "小组活动",
      title: c.title,
      context: c.theme?.title || state.group || "书影小组",
      date: c.start + " — " + c.end,
      sort: c.start,
      status: inactive ? labels[member.status] || "未参加" : labels[c.status],
      bucket: past
        ? "past"
        : c.status === "draft" || time(c.start) > now
          ? "upcoming"
          : "current",
      url: "/pages/cycle/index?id=" + encodeURIComponent(c.id),
    });
  }
  for (const e of events || []) {
    if (e.state === "deleted") continue;
    const past = e.state !== "open" || time(e.starts) <= now;
    rows.push({
      key: "store:" + e.id,
      id: e.id,
      source: "store",
      type: "书店邀约",
      title: e.title,
      context: e.shop_name + (e.place ? " · " + e.place : ""),
      date: e.starts,
      sort: e.starts,
      status:
        e.state === "cancelled"
          ? "已取消"
          : e.state === "ended"
            ? "已散场"
            : past
              ? "已开始"
              : "已留座",
      bucket: past ? "past" : "upcoming",
      url:
        "/pages/bookstore-gathering/index?id=" +
        encodeURIComponent(e.id) +
        "&circle=" +
        (e.audience === "circle" ? "1" : "0"),
    });
  }
  const rank = { upcoming: 0, current: 1, past: 2 };
  return rows.sort(
    (a, b) =>
      rank[a.bucket] - rank[b.bucket] ||
      (a.bucket === "upcoming"
        ? a.sort.localeCompare(b.sort)
        : b.sort.localeCompare(a.sort)) ||
      a.key.localeCompare(b.key),
  );
}

async function load(state, user) {
  let events = [],
    error = "";
  try {
    events = (await api.request("/api/bookstores/gather-mine")).events;
  } catch (e) {
    if (e.status === 401) throw e;
    error = "书店邀约暂未载入，请重试";
  }
  return { attending: merge(state, user, events), attendanceError: error };
}
module.exports = { merge, load };
