// Original card layouts. The same drawing commands are exercised in browser previews.
function paint(ctx, model, cover) {
  const ink = "#202820",
    green = "#193b2d",
    muted = "#637064";
  function rect(x, y, w, h, color) {
    ctx.setFillStyle(color);
    ctx.fillRect(x, y, w, h);
  }
  function text(value, x, y, size, color = ink) {
    ctx.setFontSize(size);
    ctx.setFillStyle(color);
    ctx.fillText(String(value || ""), x, y);
  }
  function lines(value, x, y, width, size, maxLines, color = ink) {
    ctx.setFontSize(size);
    const chars = Array.from(String(value || "").replace(/\s+/g, " "));
    const rows = [];
    let row = "";
    for (const ch of chars) {
      if (row && ctx.measureText(row + ch).width > width) {
        rows.push(row);
        row = ch;
      } else row += ch;
    }
    if (row) rows.push(row);
    if (rows.length > maxLines) {
      rows.length = maxLines;
      let last = rows[maxLines - 1];
      while (last && ctx.measureText(last + "…").width > width)
        last = last.slice(0, -1);
      rows[maxLines - 1] = last + "…";
    }
    rows.forEach((r, i) => text(r, x, y + i * size * 1.45, size, color));
    return y + rows.length * size * 1.45;
  }
  function photo(x, y, w, h, fit = false) {
    if (!cover) return false;
    const scale = fit
      ? Math.min(w / cover.width, h / cover.height)
      : Math.max(w / cover.width, h / cover.height);
    const dw = cover.width * scale,
      dh = cover.height * scale;
    if (fit)
      ctx.drawImage(cover.path, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    else {
      const sw = w / scale,
        sh = h / scale;
      ctx.drawImage(
        cover.path,
        (cover.width - sw) / 2,
        (cover.height - sh) / 2,
        sw,
        sh,
        x,
        y,
        w,
        h,
      );
    }
    return true;
  }
  rect(0, 0, 600, 480, "#f8f8f4");
  text("un eco", 32, 44, 25, green);
  text(model.label || "书与电影，接着聊", 360, 43, 15, muted);
  rect(32, 65, 536, 1, "#ccd2c9");
  if (model.type === "work") {
    rect(32, 94, 166, 250, "#eceee7");
    if (!photo(32, 94, 166, 250, true))
      text(model.kind === "movie" ? "影" : "书", 87, 239, 48, green);
    const end = lines(model.title, 224, 124, 340, 31, 4);
    lines(model.creator, 224, Math.min(end + 20, 322), 340, 19, 2, muted);
    text("作品简介 · 记录感想", 224, 388, 17, green);
  } else if (model.type === "store") {
    rect(32, 84, 536, 210, "#e7ece3");
    if (!photo(32, 84, 536, 210)) text("去书店坐坐", 65, 206, 36, green);
    lines(model.title, 32, 334, 536, 30, 1);
    lines(model.excerpt, 32, 372, 536, 20, 2, muted);
  } else if (model.type === "event") {
    text(model.date || "一起读书，聊电影", 32, 110, 20, green);
    lines(model.title, 32, 172, 536, 37, 3);
    lines(model.context, 32, 344, 536, 21, 2, muted);
    text(model.status || "一起参加", 32, 408, 17, green);
  } else if (model.type === "topic") {
    const end = lines(model.title, 32, 117, 536, 31, 2);
    rect(32, end + 15, 3, 145, "#b1bba8");
    lines(model.excerpt, 52, end + 39, 510, 23, 4, muted);
  } else {
    text("合上书，散了场", 32, 173, 43, green);
    text("我们接着聊", 32, 242, 43, green);
    lines(
      "记下读过的书、看过的电影，\n在书店遇见同好。",
      32,
      334,
      530,
      22,
      2,
      muted,
    );
  }
  rect(32, 435, 536, 1, "#ccd2c9");
  text("这桌还没散", 32, 462, 16, muted);
  text("打开看看  →", 454, 462, 16, green);
}
module.exports = { paint };
