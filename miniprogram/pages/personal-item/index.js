const P = require("../../lib/personal-api");
P.define({
  data: {
    item: null,
    months: [],
    history: [],
    statusIndex: 0,
    statuses: [],
    progress: 0,
    tracking: false,
    finished: P.today(),
    ratingIndex: 0,
    ratings: [
      "未评分",
      "0.5",
      "1",
      "1.5",
      "2",
      "2.5",
      "3",
      "3.5",
      "4",
      "4.5",
      "5",
    ],
    reflection: "",
    spoiler: false,
    month: P.currentMonth(),
    reviewNotes: [],
    noteIds: [],
    noteLimit: 6,
    noteVersion: "",
    noteError: "",
    aiDraft: null,
    beforeAdoption: null,
    progressOpen: false,
    notesOpen: false,
    reviewExpanded: false,
    writing: true,
  },
  onLoad(q) {
    this.id = q.id;
    this.startEditing = q.edit === "1";
    this.setData({ month: q.month || P.currentMonth() });
  },
  apply(r, force = false) {
    const before = this.data.item;
    if (
      this.dirty &&
      before &&
      Object.keys(r.item)
        .filter((k) => !["rev", "updated", "notes_version"].includes(k))
        .every((k) => r.item[k] === before[k])
    )
      this.rev = r.item.rev;
    this.setData({
      ...r,
      item: P.present(r.item),
      planned: r.months.includes(this.data.month),
      statuses:
        r.item.kind === "book"
          ? ["想读", "在读", "读完", "暂放"]
          : ["想看", "在看", "看过", "暂放"],
    });
    if (!this.dirty || force) {
      this.setData({
        statusIndex: ["wish", "reading", "done", "paused"].indexOf(
          r.item.status,
        ),
        progress: r.item.progress,
        tracking: r.item.tracking === "weread",
        finished: r.item.finished_at || P.today(),
        ratingIndex: r.item.rating === null ? 0 : r.item.rating * 2,
        reflection: r.item.reflection,
        spoiler: !!r.item.spoiler,
      });
      this.rev = r.item.rev;
    }
    if (!before) this.setData({
      writing: this.startEditing || !r.item.reflection,
      reviewExpanded: r.item.reflection.length > 240 || r.item.reflection.split("\n").length > 3,
    });
  },
  async load() {
    const r = await P.call("item", undefined, { item: this.id });
    this.apply(r);
    await this.readNotes();
    if (
      r.can_sync_notes &&
      !this.dirty &&
      (this.syncedGeneration !== r.connection.generation ||
        Date.now() - (this.lastAutoSync || 0) > 60000)
    ) {
      this.syncedGeneration = r.connection.generation;
      this.lastAutoSync = Date.now();
      setTimeout(() => {
        if (!this._gone && this.data.authorized && !this.dirty)
          this.syncNotes();
      }, 0);
    }
  },
  async readNotes() {
    const r = await P.call("notes", undefined, { item: this.id });
    this.allNotes = r.notes
      .slice()
      .sort((a, b) =>
        String(b.created || "").localeCompare(String(a.created || "")),
      );
    const noteIds = this.data.noteIds.filter((id) =>
      r.notes.some((n) => n.id === id),
    );
    this.setData({
      noteIds,
      noteVersion: r.version,
      note_count: r.notes.length,
      can_sync_notes: r.can_sync_notes,
      notes_supported: r.notes_supported,
      aiReady: r.ai_ready,
    });
    this.renderNotes();
  },
  renderNotes() {
    this.setData({
      reviewNotes: (this.allNotes || [])
        .slice(0, this.data.noteLimit)
        .map((n) => ({
          ...n,
          body: n.body.slice(0, 240),
          quote: "",
          checked: this.data.noteIds.includes(n.id),
          typeLabel: n.type === "highlight" ? "原文划线" : "我的想法",
        })),
    });
  },
  toggleProgress() {
    this.setData({ progressOpen: !this.data.progressOpen });
  },
  editReflection(e) {
    this.dirty = true;
    this.setData({ reflection: e.detail.value });
  },
  continueWriting() {
    this.setData({ writing: true });
  },
  toggleReview() {
    this.setData({ reviewExpanded: !this.data.reviewExpanded });
  },
  quoteNote(e) {
    const note = (this.allNotes || []).find(n => n.id === e.currentTarget.dataset.id);
    if (!note) return;
    const excerpt = [note.quote, note.body].filter(Boolean).filter((s, i, a) => a.indexOf(s) === i).join("\n");
    const quote = "「" + excerpt + "」" + (note.chapter ? "\n—— " + note.chapter : "");
    const reflection = [this.data.reflection, quote].filter(Boolean).join("\n\n") + "\n\n";
    if (reflection.length > 12000) { this.setData({ error: "正文最多 12000 字，请先精简再引用" }); return; }
    this.dirty = true;
    this.setData({ reflection, writing: true, reviewExpanded: true });
  },
  toggleNotes() {
    this.setData({ notesOpen: !this.data.notesOpen });
  },
  moreNotes() {
    this.setData({ noteLimit: this.data.noteLimit + 6 });
    this.renderNotes();
  },
  chooseNotes(e) {
    const shown = new Set(this.data.reviewNotes.map((n) => n.id));
    this.setData({
      noteIds: this.data.noteIds
        .filter((id) => !shown.has(id))
        .concat(e.detail.value),
    });
    this.renderNotes();
  },
  syncNotes() {
    return P.run(this, async () => {
      try {
        const r = await P.call("sync-notes", { item: this.id });
        this.apply(r);
        await this.readNotes();
        this.setData({ noteError: "" });
      } catch (e) {
        this.setData({ noteError: "笔记同步未完成，当前文字与旧笔记都保留" });
        throw e;
      }
    });
  },
  assist() {
    return P.run(this, async () => {
      if (
        !(await P.confirm(
          "使用当前文字" +
            (this.data.noteIds.length
              ? "和所选 " + this.data.noteIds.length + " 条笔记"
              : "") +
            "生成 AI 草稿？结果仅自己可见。",
        ))
      )
        return;
      const body = this.data.reflection;
      const r = await P.call("review-draft", {
        item: this.id,
        body,
        note_ids: this.data.noteIds,
        notes_version: this.data.noteVersion,
        consent: true,
      });
      this.setData({ aiDraft: r.draft, aiInput: body });
    });
  },
  async adoptReview() {
    if (
      this.data.reflection !== this.data.aiInput &&
      !(await P.confirm(
        "当前文字已修改，仍将 AI 草稿放入编辑框？原文可以恢复。",
      ))
    )
      return;
    this.dirty = true;
    this.setData({
      beforeAdoption: this.data.reflection,
      reflection: this.data.aiDraft.polished,
      aiDraft: null,
      writing: true,
      reviewExpanded: true,
    });
  },
  restoreReview() {
    this.dirty = true;
    this.setData({
      reflection: this.data.beforeAdoption,
      beforeAdoption: null,
      progressOpen: false,
      notesOpen: false,
    });
  },
  status(e) {
    this.dirty = true;
    this.setData({ statusIndex: Number(e.detail.value) });
  },
  rating(e) {
    this.dirty = true;
    this.setData({ ratingIndex: Number(e.detail.value) });
  },
  tracking(e) {
    this.dirty = true;
    this.setData({ tracking: e.detail.value });
  },
  spoiler(e) {
    this.dirty = true;
    this.setData({ spoiler: e.detail.value });
  },
  date(e) {
    this.dirty = true;
    this.setData({ finished: e.detail.value });
  },
  month(e) {
    this.setData({
      month: e.detail.value.slice(0, 7),
      planned: this.data.months.includes(e.detail.value.slice(0, 7)),
    });
  },
  plan() {
    return P.run(this, async () => {
      this.apply(
        await P.call("plan", {
          item: this.id,
          month: this.data.month,
          enabled: !this.data.planned,
        }),
      );
    });
  },
  save() {
    return P.run(this, async () => {
      const d = this.data;
      const r = await P.call("save", {
        item: this.id,
        rev: this.rev,
        status: ["wish", "reading", "done", "paused"][d.statusIndex],
        progress: Number(d.progress) || 0,
        tracking: d.tracking ? "weread" : "manual",
        finished_at: d.finished,
        rating: d.ratingIndex ? d.ratingIndex / 2 : null,
        reflection: d.reflection,
        spoiler: d.spoiler,
      });
      this.dirty = false;
      this.apply(r, true);
      this.setData({ writing: !r.item.reflection });
      wx.showToast({ title: "已保存" });
    });
  },
  sync() {
    return P.run(this, async () => {
      if (this.dirty) throw new Error("请先保存当前修改，再同步进度");
      this.apply(await P.call("sync-progress", { item: this.id }));
    });
  },
  async reload() {
    if (this.dirty && !(await P.confirm("放弃未保存的修改，重新载入记录？")))
      return;
    this.dirty = false;
    return this.load();
  },
  notes() {
    P.go("personal-notes", { id: this.id });
  },
  share() {
    P.go("personal-share", { id: this.id });
  },
});
