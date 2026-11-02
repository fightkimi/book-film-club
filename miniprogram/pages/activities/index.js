const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  ready({ state, user }) {
    this.setData({
      group: state.group,
      cycles: state.cycles
        .slice()
        .sort((a, b) => b.start.localeCompare(a.start))
        .map((c) =>
          Object.assign(D.cycleView(c), { joined: !!c.participants[user.id] }),
        ),
    });
  },
  create() {
    C.go("cycle-edit");
  },
});
