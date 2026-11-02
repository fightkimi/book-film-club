const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  data: { tab: 0, tabs: ["作品", "成员", "感想", "回顾"] },
  ready({ state, users, user }) {
    const raw = state.cycles.find((c) => c.id === this.query.id);
    if (!raw) throw new Error("活动不存在");
    const c = D.cycleView(raw);
    const reports = (state.reports[c.id] || []).map((r) =>
      Object.assign({}, r, {
        name: (users.find((u) => u.id === r.user_id) || {}).name,
        statusLabel: D.labels[r.status] || r.status,
      }),
    );
    this.setData({
      cycle: c,
      works: c.works.map(D.workView),
      reports,
      me: c.participants[user.id] || null,
      canWrite: ["active", "closed"].includes(c.status),
      reviews: state.reviews
        .filter((r) => r.cycle_id === c.id)
        .map((r) =>
          Object.assign({}, r, {
            name: (users.find((u) => u.id === r.user_id) || {}).name,
            workTitle: (c.works.find((w) => w.id === r.work_id) || {}).title,
          }),
        ),
      nominations: c.nominations
        .map((id) => state.works.find((w) => w.id === id))
        .filter(Boolean)
        .map((w) =>
          Object.assign(D.workView(w), {
            votes: state.votes.filter(
              (v) => v.cycle_id === c.id && v.work_id === w.id,
            ).length,
            voted: state.votes.some(
              (v) =>
                v.cycle_id === c.id &&
                v.work_id === w.id &&
                v.user_id === user.id,
            ),
          }),
        ),
    });
  },
  tab(e) {
    this.setData({ tab: Number(e.currentTarget.dataset.index) });
  },
  progress() {
    C.go("progress", { id: this.query.id });
  },
  review() {
    C.go("review", { id: this.query.id });
  },
  edit() {
    C.go("cycle-edit", { id: this.query.id });
  },
  recap() {
    C.go("recap", { id: this.query.id });
  },
  recommend() {
    C.go("recommend", {
      theme_id: this.data.cycle.theme_id,
      cycle_id: this.query.id,
    });
  },
  vote(e) {
    C.run(this, async () => {
      await C.api.action("vote", {
        cycle_id: this.query.id,
        work_id: e.currentTarget.dataset.id,
      });
      await this.readyAgain();
    });
  },
  async readyAgain() {
    const d = C.api.get();
    const c = d.state.cycles.find((c) => c.id === this.query.id);
    this.setData({
      nominations: this.data.nominations.map((w) =>
        Object.assign({}, w, {
          votes: d.state.votes.filter(
            (v) => v.cycle_id === c.id && v.work_id === w.id,
          ).length,
          voted: d.state.votes.some(
            (v) =>
              v.cycle_id === c.id &&
              v.work_id === w.id &&
              v.user_id === d.user.id,
          ),
        }),
      ),
    });
  },
  transition(e) {
    const target = e.currentTarget.dataset.status;
    C.run(this, async () => {
      if (
        !(await C.confirm(
          target === "archived"
            ? "归档后本期只读，并冻结完成统计。确认归档？"
            : "确认" +
                { active: "发布 / 开启", closed: "结束" }[target] +
                "本期活动？",
        ))
      )
        return;
      await C.api.action("cycle.transition", {
        id: this.query.id,
        status: target,
      });
      wx.redirectTo({ url: "/pages/cycle/index?id=" + this.query.id });
    });
  },
  participation() {
    const self = this;
    wx.showActionSheet({
      itemList: ["正常参与", "请假", "不参加", "标记已参与讨论"],
      success(r) {
        C.run(self, async () => {
          const me = self.data.me;
          await C.api.action("participation.save", {
            cycle_id: self.query.id,
            status:
              r.tapIndex === 3
                ? me.status
                : ["joined", "leave", "opted_out"][r.tapIndex],
            discussion: r.tapIndex === 3 ? true : me.discussion,
          });
          wx.redirectTo({ url: "/pages/cycle/index?id=" + self.query.id });
        });
      },
    });
  },
  reveal(e) {
    this.setData({ ["revealed." + e.currentTarget.dataset.id]: true });
  },
});
