const { posterUrl } = require("./poster-url");
const catalog = require("../assets/posters");

function themePoster(theme = {}) {
  if (theme.poster_key === "none") return null;
  return (
    catalog.find((p) =>
      theme.poster_key ? p.id === theme.poster_key : p.theme === theme.title,
    ) || null
  );
}

function activityCover(theme, works = []) {
  const poster = themePoster(theme);
  if (poster)
    return { image: poster.image, caption: "主题海报 · " + poster.title };
  const work = works.find(
    (w) => typeof w.image === "string" && /^https:\/\//i.test(w.image),
  );
  if (work) return { image: posterUrl(work.image), caption: "作品封面 · " + work.title };
  return { image: "", caption: "活动题签" };
}

module.exports = { catalog, themePoster, activityCover };
