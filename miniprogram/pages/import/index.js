const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  data: {
    provider: "douban",
    providerName: "豆瓣",
    content: "",
    statusIndex: 0,
    statuses: ["已完成", "想读 / 想看", "进行中", "仅评分，不标记完成"],
    modeIndex: 0,
    modes: ["导出文件", "公开 Trakt 账号"],
    username: "",
    collectionIndex: 0,
    collections: ["观看历史", "想看片单", "个人评分（不标记已看）"],
    page: 1,
    preview: null,
    overwrite: false,
    sync: false,
    done: null,
  },
  ready() {
    if (this.initialized) return;
    this.initialized = true;
    const provider = ["douban", "letterboxd", "trakt"].includes(
      this.query.provider,
    )
      ? this.query.provider
      : "douban";
    this.setData({
      provider,
      providerName: {
        douban: "豆瓣",
        letterboxd: "Letterboxd",
        trakt: "Trakt",
      }[provider],
    });
  },
  pick(e) {
    this.setData({ [e.currentTarget.dataset.field]: Number(e.detail.value) });
  },
  choose() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: this.data.provider === "trakt" ? ["json"] : ["csv"],
      success: (r) => {
        const file = r.tempFiles[0];
        if (file.size > 100000) {
          this.setData({ error: "文件需小于 100 KB，每批最多 200 条" });
          return;
        }
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: "utf8",
          success: (r) => this.setData({ content: r.data, error: "" }),
          fail: () =>
            this.setData({ error: "无法读取文件，请使用 UTF-8 文本" }),
        });
      },
    });
  },
  loadPreview() {
    C.run(this, async () => {
      const online =
        this.data.provider === "trakt" && this.data.modeIndex === 1;
      const r = await C.api.request(
        online ? "/api/import/trakt" : "/api/import/preview",
        online
          ? {
              username: this.data.username,
              collection: ["history", "watchlist", "ratings"][
                this.data.collectionIndex
              ],
              page: Number(this.data.page),
            }
          : {
              provider: this.data.provider,
              content: this.data.content,
              status: ["done", "wish", "reading", "none"][
                this.data.statusIndex
              ],
            },
      );
      const works = C.api.get().state.works;
      const rows = r.rows.map((row) => {
        const choices = [{ id: "", title: "暂不关联，保留原始记录" }].concat(
          works
            .filter((w) => w.kind === row.kind)
            .map((w) => ({
              id: w.id,
              title: w.title + " / " + (w.year || "年份未录入"),
            })),
        );
        return Object.assign({}, row, {
          selected: true,
          statusLabel: D.labels[row.status] || "未标记",
          choices,
          choiceIndex: Math.max(
            0,
            choices.findIndex((w) => w.id === row.suggested_work_id),
          ),
        });
      });
      this.setData({ preview: r, rows });
    });
  },
  selection(e) {
    this.setData({
      ["rows[" + e.currentTarget.dataset.index + "].selected"]: e.detail.value,
    });
  },
  match(e) {
    this.setData({
      ["rows[" + e.currentTarget.dataset.index + "].choiceIndex"]: Number(
        e.detail.value,
      ),
    });
  },
  back() {
    this.setData({ preview: null });
  },
  save() {
    C.run(this, async () => {
      const selected = this.data.rows.filter((r) => r.selected);
      const mappings = {};
      selected.forEach(
        (r) => (mappings[r.source_key] = r.choices[r.choiceIndex].id),
      );
      const result = await C.api.action("library.import", {
        token: this.data.preview.token,
        selected: selected.map((r) => r.source_key),
        mappings,
        overwrite: this.data.overwrite,
        sync_shelf: this.data.sync,
      });
      this.setData({ done: result.result, preview: null, content: "" });
    });
  },
  finish() {
    wx.redirectTo({ url: "/pages/journal/index" });
  },
});
