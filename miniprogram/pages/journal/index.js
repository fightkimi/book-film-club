const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  ready({ state }) {
    this.setData({
      rows: (state.journals || []).map((j) =>
        Object.assign({}, j, {
          statusLabel: D.labels[j.status] || j.status,
          choices: [{ id: "", title: "暂不关联" }].concat(
            state.works.filter((w) => w.kind === j.kind),
          ),
          index: Math.max(
            0,
            [{ id: "" }]
              .concat(state.works.filter((w) => w.kind === j.kind))
              .findIndex((w) => w.id === j.work_id),
          ),
        }),
      ),
    });
  },
  reveal(e) {
    this.setData({ ["revealed." + e.currentTarget.dataset.id]: true });
  },
  link(e) {
    const row = this.data.rows[e.currentTarget.dataset.row];
    const selected = row.choices[e.detail.value];
    if (!selected.id) return;
    C.run(this, async () => {
      await C.api.action("journal.link", { id: row.id, work_id: selected.id });
      this.setData({
        ["rows[" + e.currentTarget.dataset.row + "].index"]: Number(
          e.detail.value,
        ),
        notice: "已关联作品",
      });
    });
  },
  search(e) {
    const r = this.data.rows[e.currentTarget.dataset.row];
    C.go("metadata", { title: r.title, kind: r.kind });
  },
});
