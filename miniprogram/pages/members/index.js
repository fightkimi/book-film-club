const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  data: { adding: false, name: "" },
  ready({ state, users }) {
    this.setData({
      members: users.map((u) =>
        Object.assign({}, u, {
          cycles: state.cycles.filter((c) => c.participants[u.id]).length,
        }),
      ),
    });
  },
  add() {
    this.setData({ adding: !this.data.adding });
  },
  save() {
    C.run(this, async () => {
      const result = await C.api.action("member.wechat_add", {
        name: this.data.name,
      });
      this.setData({ name: "", adding: false });
      C.go("member", { id: result.result.id });
    });
  },
  view(e) {
    C.go("member", { id: e.currentTarget.dataset.id });
  },
});
