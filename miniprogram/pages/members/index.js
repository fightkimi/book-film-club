const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  data: { adding: false, name: "", username: "", credential: "" },
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
      await C.api.action("member.add", {
        name: this.data.name,
        username: this.data.username,
        credential: this.data.credential,
      });
      this.setData({ credential: "", adding: false, notice: "成员已创建" });
      const { users, state } = C.api.get();
      this.setData({
        members: users.map((u) =>
          Object.assign({}, u, {
            cycles: state.cycles.filter((c) => c.participants[u.id]).length,
          }),
        ),
      });
    });
  },
  view(e) {
    C.go("member", { id: e.currentTarget.dataset.id });
  },
});
