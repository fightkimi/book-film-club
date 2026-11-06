const api = require("./api");
const genreOrder = [
  "剧情",
  "喜剧",
  "爱情",
  "音乐与歌舞",
  "科幻",
  "悬疑",
  "犯罪",
  "动作",
  "动画",
  "奇幻",
  "冒险",
  "纪录片",
  "战争",
  "历史",
  "惊悚",
  "恐怖",
  "西部",
  "家庭",
];
function orderGenres(genres) {
  const rank = (name) =>
    genreOrder.includes(name) ? genreOrder.indexOf(name) : genreOrder.length;
  return genres.slice().sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
let cached, pending;
async function load(force = false) {
  if (!api.hasSession())
    throw Object.assign(new Error("请先微信登录"), { status: 401 });
  if (cached?.classifications && !force) return cached;
  if (pending) return pending;
  const generation = api.sessionGeneration();
  pending = api
    .request("/api/bookstores/personal/movie-catalog")
    .then((result) => {
      if (api.sessionGeneration() !== generation)
        throw Object.assign(new Error("登录状态已变化"), { status: 401 });
      cached = result;
      return result;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
function merge(local, movies, classifications = {}) {
  const known = new Set(
    local
      .filter((w) => w.kind === "movie" && w.provider === "tmdb")
      .map((w) => String(w.source_id)),
  );
  return [
    ...local.map((w) =>
      w.kind === "movie" &&
      w.provider === "tmdb" &&
      classifications[String(w.source_id)]
        ? { ...w, browse_genres: classifications[String(w.source_id)] }
        : w,
    ),
    ...movies
      .filter((w) => !known.has(String(w.source_id)))
      .map((w) => ({ ...w, external: true, externalMovie: true })),
  ];
}
module.exports = { load, merge, orderGenres };
