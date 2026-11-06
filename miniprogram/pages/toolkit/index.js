const C = require("../../lib/page");
C.define({
  data: { tab: 0, tabs: ["导入", "旧档案", "视听词典", "资料来源"] },
  onLoad(query) {
    if (query.tab === "archive") this.setData({ tab: 1 });
  },
  async ready({ state, services }) {
    const r = await C.api.request("/api/toolkit");
    this.setData({
      glossary: r.glossary,
      journals: state.journals || [],
      studies: (state.studies || []).map((s) =>
        Object.assign({}, s, {
          title: state.works.find((w) => w.id === s.work_id)?.title || "作品",
        }),
      ),
      sourceRows: [
        { name: "微信读书", what: "中文书籍与封面", ready: services.weread },
        { name: "Open Library", what: "书籍、作者、ISBN 与封面", ready: true },
        {
          name: "Google Books",
          what: "图书版本补充",
          ready: services.googlebooks,
        },
        {
          name: "TMDB",
          what: "中文电影、海报、评分与榜单",
          ready: services.tmdb,
        },
        {
          name: "Trakt",
          what: "在线公开记录；文件导入无需配置",
          ready: services.trakt,
        },
        { name: "OMDb", what: "可选跨站评分", ready: services.omdb },
        { name: "AI", what: "推荐、导赏与感想辅助", ready: services.ai },
      ],
    });
  },
  tab(e) {
    this.setData({ tab: Number(e.currentTarget.dataset.index) });
  },
  importFile(e) {
    C.go("import", { provider: e.currentTarget.dataset.provider });
  },
  charts() {
    C.go("films");
  },
  journal() {
    C.go("journal");
  },
  notebook(e) {
    C.go("notebook", {
      id: e.currentTarget.dataset.id,
      mode: e.currentTarget.dataset.mode,
    });
  },
  library() {
    wx.switchTab({ url: "/pages/library/index" });
  },
  exportData() {
    C.run(this, async () => {
      const r = await C.api.request("/api/personal-export");
      const path = wx.env.USER_DATA_PATH + "/tongpin-personal.json";
      wx.getFileSystemManager().writeFileSync(
        path,
        JSON.stringify(r, null, 2),
        "utf8",
      );
      if (wx.shareFileMessage)
        await new Promise((resolve, reject) =>
          wx.shareFileMessage({
            filePath: path,
            fileName: "un eco 个人档案.json",
            success: resolve,
            fail: reject,
          }),
        );
      else
        this.setData({ notice: "已保存个人档案；此基础库暂不支持文件分享。" });
    });
  },
});
