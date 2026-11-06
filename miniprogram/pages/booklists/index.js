const C = require("../../lib/page");
const { coverThumbnail } = require("../../lib/poster-url");

C.define({
  data: {
    tab: "member",
    options: [],
    selected: 0,
    folders: [],
    folder: 0,
    rows: [],
    count: 0,
    limit: 20,
  },
  onLoad(query) {
    this.setData({ tab: query.tab === "rank" ? "rank" : "member" });
  },
  async ready(snapshot, force) {
    this.directory = await C.api.readList("/api/booklists", undefined, force);
    await this.loadList(this.data.tab, this.data.selected, force);
  },
  async loadList(tab, index, force = false) {
    const options =
      tab === "rank"
        ? this.directory.ranks
        : [
            { name: "全组书目", group: true, connected: true },
            ...this.directory.members,
          ];
    const selected = options[index] ? index : 0;
    const option = options[selected];
    this.books = [];
    this.setData({
      tab,
      options,
      selected,
      folder: 0,
      folders: [],
      rows: [],
      count: 0,
      limit: 20,
      connected: !!option && option.connected !== false,
    });
    if (!option || option.connected === false) return;
    const payload = tab === "rank" ? { id: option.id } : { name: option.name };
    const list = option.group
      ? await C.api.groupBooks(force)
      : await C.api.readList("/api/booklists/" + tab, payload, force);
    if (this._gone) return;
    this.books = list.books.map((b) => ({
      ...b,
      thumbnail: coverThumbnail(b.cover),
    }));
    this.setData({
      scope: option.group ? "group" : list.scope || "rank",
      partial: list.unavailable?.join("、") || "",
      folders: [{ name: "全部电子书" }, ...(list.folders || [])],
    });
    this.showRows(0, 20);
  },
  showRows(folder, limit) {
    const ids = this.data.folders[folder]?.ids;
    const allowed = ids && new Set(ids);
    const books = allowed
      ? this.books.filter((b) => allowed.has(b.id))
      : this.books;
    this.setData({
      folder,
      limit,
      rows: books.slice(0, limit),
      count: books.length,
    });
  },
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (this.directory && tab !== this.data.tab)
      C.run(this, () => this.loadList(tab, 0));
  },
  select(e) {
    C.run(this, () => this.loadList(this.data.tab, Number(e.detail.value)));
  },
  filterFolder(e) {
    this.showRows(Number(e.detail.value), 20);
  },
  onReachBottom() {
    if (this.data.limit < this.data.count)
      this.showRows(this.data.folder, this.data.limit + 20);
  },
  coverError(e) {
    const index = e.currentTarget.dataset.index,
      row = this.data.rows[index];
    if (
      row &&
      row.id === e.currentTarget.dataset.id &&
      row.thumbnail !== row.cover
    )
      this.setData({ ["rows[" + index + "].thumbnail"]: row.cover });
  },
  detail(e) {
    const row = this.data.rows[e.currentTarget.dataset.index];
    if (row.personalUpload) {
      wx.showToast({ title: "个人导入书，仅分享书目信息", icon: "none" });
      return;
    }
    const existing =
      row.workId ||
      C.api
        .get()
        .state.works.find(
          (w) => w.provider === "weread" && String(w.source_id) === row.id,
        )?.id;
    if (existing) C.go("work", { id: existing });
    else C.go("work", { weread_id: row.id });
  },
});
