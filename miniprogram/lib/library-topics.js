const { themePoster } = require("./covers");

// Total membership is independent of the current search and media type.
function libraryTopics(state) {
  const works = state.works || [];
  const ids = new Set(works.map((w) => w.id));
  const groups = new Map();
  const classified = new Set();
  function add(key, label, id) {
    if (!ids.has(id)) return;
    if (!groups.has(key)) groups.set(key, { key, label, ids: new Set() });
    groups.get(key).ids.add(id);
    classified.add(id);
  }

  const titles = new Map((state.themes || []).map((t) => [t.id, t.title]));
  for (const cycle of state.cycles || []) {
    const name = titles.get(cycle.theme_id) || cycle.theme?.title;
    if (!name || !cycle.theme_id) continue;
    for (const w of cycle.works || []) {
      add("club:" + cycle.theme_id, name, w.id);
    }
  }
  for (const theme of state.themes || []) {
    const poster = themePoster(theme);
    if (!poster) continue;
    for (const w of works) {
      if (
        w.kind === "movie" &&
        w.title === poster.title &&
        String(w.year).slice(0, 4) === poster.year
      ) {
        add("club:" + theme.id, theme.title, w.id);
      }
    }
  }
  for (const w of works) {
    for (const tag of Array.isArray(w.browse_genres)
      ? w.browse_genres
      : (w.tags || "").split(/[/|,，、;；>＞]+/)) {
      const name = tag.trim();
      if (name) add("genre:" + name, name, w.id);
    }
  }

  const options = [...groups.values()]
    .sort((a, b) => {
      const section =
        Number(a.key.startsWith("genre:")) - Number(b.key.startsWith("genre:"));
      return (
        section || b.ids.size - a.ids.size || a.label.localeCompare(b.label)
      );
    })
    .map(({ key, label, ids }) => ({
      key,
      label,
      section: key.startsWith("club:") ? "小组主题" : "作品题材",
      count: ids.size,
    }));
  const ungrouped = new Set(
    works.filter((w) => !classified.has(w.id)).map((w) => w.id),
  );
  if (ungrouped.size) {
    groups.set("other", { ids: ungrouped });
    options.push({
      key: "other",
      label: "未归类",
      section: "",
      count: ungrouped.size,
    });
  }
  options.unshift({
    key: "",
    label: "全部主题",
    section: "",
    count: works.length,
  });
  return { options, groups };
}

module.exports = { libraryTopics };
