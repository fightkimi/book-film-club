const P = require("../../lib/personal-api");
P.define({
  data: {
    item: null,
    notesCount: 0,
    visible: [],
    digests: [],
    chapters: ["全部章节"],
    chapterIndex: 0,
    selected: [],
    selectedCount: 0,
    limit: 40,
    body: "",
    chapter: "",
    writing: false,
  },
  onLoad(q) {
    this.id = q.id;
  },
  apply(r) {
    this.notes = r.notes;
    const selected = this.data.selected.filter((id) =>
      r.notes.some((n) => n.id === id),
    );
    this.setData({
      item: r.item,
      digests: r.digests,
      version: r.version,
      ai_ready: r.ai_ready,
      connected: r.connected,
      can_sync_notes: r.can_sync_notes,
      notes_supported: r.notes_supported,
      notesCount: r.notes.length,
      selected,
      selectedCount: selected.length,
      chapters: [
        "全部章节",
        ...new Set(r.notes.map((n) => n.chapter || "未分章")),
      ],
      chapterIndex: 0,
      limit: 40,
    });
    this.render();
  },
  async load() {
    this.apply(await P.call("notes", undefined, { item: this.id }));
  },
  render() {
    const d = this.data;
    const filtered = (this.notes || []).filter(
      (n) =>
        !d.chapterIndex ||
        (n.chapter || "未分章") === d.chapters[d.chapterIndex],
    );
    this.setData({
      visible: filtered.slice(0, d.limit).map((n) => ({
        ...n,
        checked: d.selected.includes(n.id),
        typeLabel: n.type === "highlight" ? "原文划线" : "我的想法",
      })),
      more: filtered.length > d.limit,
      total: filtered.length,
    });
  },
  chapter(e) {
    this.setData({ chapterIndex: Number(e.detail.value), limit: 40 });
    this.render();
  },
  next() {
    this.setData({ limit: this.data.limit + 40 });
    this.render();
  },
  selection(e) {
    const shown = new Set(this.data.visible.map((n) => n.id));
    const selected = this.data.selected
      .filter((id) => !shown.has(id))
      .concat(e.detail.value);
    this.request = null;
    this.setData({ selected, selectedCount: selected.length });
    this.render();
  },
  selectVisible() {
    const ids = [
      ...new Set(this.data.selected.concat(this.data.visible.map((n) => n.id))),
    ];
    this.request = null;
    this.setData({ selected: ids, selectedCount: ids.length });
    this.render();
  },
  clear() {
    this.request = null;
    this.setData({ selected: [], selectedCount: 0 });
    this.render();
  },
  sync() {
    return P.run(this, async () => {
      await P.call("sync-notes", { item: this.id });
      this.apply(await P.call("notes", undefined, { item: this.id }));
      wx.showToast({ title: "笔记已同步" });
    });
  },
  toggleWriting() {
    this.setData({ writing: !this.data.writing });
  },
  saveNote() {
    return P.run(this, async () => {
      this.apply(
        await P.call("note-add", {
          item: this.id,
          body: this.data.body,
          chapter: this.data.chapter,
        }),
      );
      this.setData({ body: "", chapter: "", writing: false });
    });
  },
  generate() {
    return P.run(this, async () => {
      const count = this.data.selected.length;
      if (!count || count > 80) throw new Error("每次选择 1 至 80 条笔记");
      if (
        !(await P.confirm(
          "将所选 " + count + " 条笔记交给 AI 整理？结果仅自己可见。",
        ))
      )
        return;
      const fingerprint = JSON.stringify([
        this.data.version,
        this.data.selected.slice().sort(),
      ]);
      if (!this.request || this.request.fingerprint !== fingerprint)
        this.request = { id: P.requestId(), fingerprint };
      const r = await P.call("digest-generate", {
        item: this.id,
        note_ids: this.data.selected,
        notes_version: this.data.version,
        request_id: this.request.id,
        consent: true,
      });
      P.go("personal-digest", { id: r.id });
    });
  },
});
