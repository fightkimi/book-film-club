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
  return Object.assign({}, work, {
    kindLabel: labels[work.kind],
    date: date(work.year),
    complete: work.metadata_status === "confirmed",
  });
}
function cycleView(c) {
  return Object.assign({}, c, {
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
          (w.tags || "") +
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
