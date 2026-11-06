const fallback = "/assets/yuxiang-avatar.png";
const brand = {
  type: "app",
  title: "合上书，散了场，我们接着聊",
  label: "这桌还没散",
};
const routes = {
  activities: [],
  library: [],
  bookstores: [],
  profile: [],
  cycle: ["id"],
  work: ["id", "weread_id", "movie_id"],
  bookstore: ["id"],
  "bookstore-topic": ["id"],
  "bookstore-guide": ["city"],
};
let brandImage = "";
function decodeQuery(query = {}) {
  const result = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== "string") {
      result[key] = value;
      continue;
    }
    try {
      result[key] = decodeURIComponent(value);
    } catch (_) {
      result[key] = value;
    }
  }
  return result;
}
function target(page, params = {}) {
  if (!Object.prototype.hasOwnProperty.call(routes, page)) return "";
  const parts = [];
  for (const key of routes[page]) {
    const value = params[key];
    if (value === undefined || value === "") continue;
    if (
      typeof value !== "string" ||
      value.length > 100 ||
      /[\u0000-\u001f]/.test(value)
    )
      return "";
    parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
  }
  return (
    "/pages/" + page + "/index" + (parts.length ? "?" + parts.join("&") : "")
  );
}
function validate(raw) {
  if (typeof raw !== "string" || raw.length > 700) return "";
  const match = /^\/pages\/([a-z-]+)\/index(?:\?([^#]*))?$/.exec(raw);
  if (!match || !Object.prototype.hasOwnProperty.call(routes, match[1]))
    return "";
  const params = {};
  try {
    for (const part of (match[2] || "").split("&").filter(Boolean)) {
      const [key, ...rest] = part.split("=");
      params[decodeURIComponent(key)] = decodeURIComponent(rest.join("="));
    }
  } catch (_) {
    return "";
  }
  return target(match[1], params);
}
function loginPath(destination) {
  return (
    "/pages/login/index" +
    (validate(destination)
      ? "?target=" + encodeURIComponent(validate(destination))
      : "")
  );
}
function resume(destination) {
  const safe = validate(destination);
  if (!safe) return false;
  if (/^\/pages\/(activities|library|bookstores|profile)\/index$/.test(safe))
    wx.switchTab({ url: safe });
  else wx.redirectTo({ url: safe });
  return true;
}
function describe(page) {
  const d = page.data || {},
    q = page.query || page.q || {},
    name = (page.route || "").split("/")[1];
  const result = { model: brand, destination: target("activities") };
  if (
    ["bookstore-gathering", "bookstore-gathering-success"].includes(name) &&
    d.v &&
    d.v.state !== "deleted"
  ) {
    const v = d.v,
      circle = v.audience === "circle";
    return {
      model: circle
        ? {
            type: "event",
            label: "圈友专场",
            title: "本店圈友的邀约",
            context: "入圈后查看活动详情",
            status: "书店邀约",
          }
        : {
            type: "event",
            label: v.kind === "notice" ? "书店告示" : "书店邀约",
            title: v.title,
            date: v.starts,
            context: v.shop_name + (v.place ? " · " + v.place : ""),
            status:
              v.state === "cancelled"
                ? "已取消"
                : v.state === "ended"
                  ? "已散场"
                  : "店里有约",
          },
      path:
        "/pages/bookstore-gathering/index?id=" +
        encodeURIComponent(page.id) +
        "&circle=" +
        (circle ? "1" : "0"),
    };
  }
  if (name === "work" && d.work) {
    const publicBook = !d.work.personalUpload && d.work.provider === "weread";
    const catalogId =
      q.book_source === "catalog" && q.book_id?.startsWith("work:")
        ? q.book_id.slice(5)
        : "";
    const wereadId =
      q.book_source === "catalog" && q.book_id?.startsWith("shelf:")
        ? q.book_id.slice(6)
        : q.book_id;
    const params = q.movie_id
      ? { movie_id: q.movie_id }
      : q.id || catalogId
        ? { id: q.id || catalogId }
        : q.weread_id
          ? { weread_id: q.weread_id }
          : q.book_source === "public" || publicBook
            ? { weread_id: wereadId }
            : null;
    if (params)
      return {
        model: {
          type: "work",
          label: d.work.kind === "movie" ? "电影" : "书籍",
          kind: d.work.kind,
          title: d.work.title,
          creator: d.work.creator,
          cover: d.coverUrl || d.work.image,
        },
        destination: target("work", params),
      };
  }
  if (name === "cycle" && d.cycle && d.cycle.status !== "draft")
    return {
      model: {
        type: "event",
        label: "小组活动",
        title: d.cycle.title,
        date: d.cycle.start + " — " + d.cycle.end,
        context: d.cycle.theme?.title || "书影相聚",
        status: d.cycle.statusLabel,
      },
      destination: target("cycle", { id: q.id }),
    };
  if (name === "bookstore" && d.store && !d.managing)
    return {
      model: {
        type: "store",
        label: d.store.city + " · 独立书店",
        title: d.store.name,
        excerpt: d.store.lead,
        cover: d.store.photos?.[0]?.[0],
      },
      destination: target("bookstore", { id: page.id }),
    };
  if (name === "bookstore-topic" && d.post && d.post.scope === "city")
    return {
      model: {
        type: "topic",
        label: d.post.kind || "书店树洞",
        title: d.post.title,
        excerpt: d.post.spoiler
          ? "含剧透，点开后再阅读"
          : d.post.body?.slice(0, 150),
      },
      destination: target("bookstore-topic", { id: String(page.id) }),
    };
  if (name === "bookstore-topic" && d.post?.scope === "circle")
    return {
      model: {
        type: "topic",
        label: "到店读者圈",
        title: "本店圈内的讨论",
        excerpt: "圈友登录后查看",
      },
      destination: target("bookstore-topic", { id: String(page.id) }),
    };
  if (name === "bookstore-guide")
    return {
      model: { ...brand, label: (d.city || "全国") + " · 逛书店" },
      destination: target("bookstore-guide", { city: d.city || "全国" }),
    };
  if (name === "bookstores")
    return {
      model: { ...brand, label: "书店树洞" },
      destination: target("bookstores"),
    };
  if (name === "bookstore-forum" && d.shop)
    return {
      model: { ...brand, label: "到店读者圈" },
      destination: target("bookstore", { id: d.shop }),
    };
  return result;
}
function enable() {
  wx.showShareMenu?.({ menus: ["shareAppMessage"] });
}
function coverFor(page) {
  return page._shareImage || brandImage || fallback;
}
function prepare(page, custom) {
  const info = custom || describe(page);
  const key = JSON.stringify(info.model);
  if (page._shareKey === key && page._sharePending) return page._sharePending;
  page._shareKey = key;
  page._shareImage = "";
  const component = page.selectComponent?.("#share-card");
  if (!component) return Promise.resolve("");
  page._sharePending = component
    .render(info.model)
    .then((image) => {
      if (page._shareKey === key) page._shareImage = image;
      if (info.model.type === "app" && image) brandImage = image;
      return image;
    })
    .catch(() => "");
  return page._sharePending;
}
function message() {
  const info = describe(this),
    key = JSON.stringify(info.model);
  const card = {
    title: info.model.title,
    path: info.path || loginPath(info.destination),
    imageUrl:
      (this._shareKey === key && this._shareImage) || brandImage || fallback,
  };
  return {
    ...card,
    promise: prepare(this, info).then((image) => ({
      ...card,
      imageUrl: image || card.imageUrl,
    })),
  };
}
module.exports = {
  target,
  validate,
  loginPath,
  resume,
  describe,
  enable,
  prepare,
  message,
  coverFor,
  brand,
  decodeQuery,
};
