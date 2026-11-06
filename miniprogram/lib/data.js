const { posterUrl } = require("./poster-url");
const { activityCover } = require("./covers");

const labels = {
  book: "书籍",
  movie: "电影",
  mixed: "书影联动",
  draft: "筹备中",
  active: "进行中",
  closed: "已结束",
  archived: "已归档",
  done: "已完成",
  late_done: "已补交",
  overdue: "已逾期",
  pending: "未完成",
  planned: "筹备中",
  not_started: "未开始",
  in_progress: "进行中",
  joined: "参与",
  leave: "请假",
  opted_out: "不参加",
  wish: "想读 / 想看",
  reading: "进行中",
  none: "未收藏",
};
function date(value) {
  return value ? String(value).slice(0, 10) : "—";
}
function workView(work) {
  const required = [
    ["title", "标题"],
    ["creator", work.kind === "movie" ? "导演" : "作者"],
    ["description", "简介"],
    ["image", "封面"],
    ["source_url", "来源"],
  ];
  const missing = required
    .filter(([field]) => !work[field])
    .map(([, label]) => label);
  const complete = !missing.length && work.metadata_status === "confirmed";
  return Object.assign({}, work, {
    kindLabel: labels[work.kind],
    coverUrl: posterUrl(work.image),
    date: date(work.year),
    complete,
    metadataHint: missing.length
      ? missing.length === 1
        ? "缺" + missing[0]
        : "缺 " + missing.length + " 项"
      : complete
        ? ""
        : "待核对",
    metadataDetail: missing.length
      ? "尚缺" + missing.join("、")
      : complete
        ? "已确认匹配"
        : "字段齐全，来源待核对",
  });
}
function cycleView(c) {
  return Object.assign({}, c, {
    cover: activityCover(c.theme, c.works),
    statusLabel: labels[c.status],
    kindLabel: labels[c.kind],
    startLabel: date(c.start),
    endLabel: date(c.end),
  });
}
function filterWorks(works, kind, query) {
  const q = (query || "").toLowerCase();
  return works
    .filter(
      (w) =>
        (!kind || w.kind === kind) &&
        (
          w.title +
          " " +
          w.creator +
          " " +
          (Array.isArray(w.browse_genres)
            ? w.browse_genres.join(" ")
            : w.tags || "") +
          " " +
          ((w.extra || {}).aliases || []).join(" ") +
          " " +
          ((w.extra || {}).original_title || "")
        )
          .toLowerCase()
          .includes(q),
    )
    .map(workView);
}
module.exports = { labels, date, workView, cycleView, filterWorks };
