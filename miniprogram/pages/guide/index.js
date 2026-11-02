const C = require("../../lib/page");
C.define({
  ready({ state }) {
    const work = state.works.find((w) => w.id === this.query.id);
    if (!work) throw new Error("作品不存在");
    this.setData({
      work,
      points:
        work.kind === "book"
          ? [
              "是谁在讲述？他的视角有哪些局限？",
              "哪些意象、词语和场景反复出现？",
              "你最想和大家讨论哪个选择？",
            ]
          : [
              "画面把你的注意力引向哪里？",
              "声音、沉默和剪辑如何改变感受？",
              "你最想和大家讨论哪个选择？",
            ],
    });
  },
  generate() {
    C.run(this, async () => {
      const r = await C.api.request("/api/ai", {
        task: "guide",
        work_id: this.query.id,
      });
      this.setData({ draft: r.draft });
    });
  },
});
