const C = require("../../lib/page"),
  D = require("../../lib/data");
C.define({
  data: {
    query: "",
    kind: "",
    shelf: "",
    kindIndex: 0,
    shelfIndex: 0,
    kinds: ["全部作品", "书籍", "电影"],
    shelves: ["全部状态", "想读 / 想看", "进行中", "已完成", "资料待补全"],
  },
  ready() {
    this.filter();
  },
  search(e) {
    this.setData({ query: e.detail.value });
    this.filter();
  },
  kind(e) {
    this.setData({
      kindIndex: Number(e.detail.value),
      kind: ["", "book", "movie"][e.detail.value],
    });
    this.filter();
  },
  shelf(e) {
    this.setData({
      shelfIndex: Number(e.detail.value),
      shelf: ["", "wish", "reading", "done", "pending"][e.detail.value],
    });
    this.filter();
  },
  filter() {
    const { state, user } = C.api.get();
    const rows = D.filterWorks(
      state.works,
      this.data.kind,
      this.data.query,
    ).filter(
      (w) =>
        !this.data.shelf ||
        (this.data.shelf === "pending"
          ? w.metadata_status !== "confirmed"
          : state.shelves.some(
              (s) =>
                s.user_id === user.id &&
                s.work_id === w.id &&
                s.status === this.data.shelf,
            )),
    );
    this.setData({ works: rows.slice().reverse() });
  },
  add() {
    C.go("metadata");
  },
});
