Component({
  properties: {
    title: { type: String, value: "请选择" },
    range: { type: Array, value: [] },
    rangeKey: String,
    grouped: Boolean,
    value: Number,
    disabled: Boolean,
  },
  data: {
    opened: false,
    query: "",
    rows: [],
    anchor: "",
    section: "",
    searchable: false,
  },
  observers: {
    "range, rangeKey, value, grouped"() {
      if (this.data.opened) this.updateRows(this.data.query);
    },
    disabled(value) {
      if (value && this.data.opened) this.close();
    },
  },
  pageLifetimes: {
    hide() {
      if (this.data.opened) this.close();
    },
  },
  methods: {
    open() {
      if (this.data.disabled || !this.data.range?.length) return;
      this.setData({ opened: true, query: "", section: "" });
      this.updateRows("");
    },
    updateRows(query) {
      const { range, rangeKey, value, grouped, section } = this.data;
      const options = (range || []).map((item, index) => ({
        key: "option-" + index,
        index,
        label: String(rangeKey ? (item?.[rangeKey] ?? "") : item),
        section: grouped ? item.section : "",
        count: grouped ? item.count : null,
      }));
      let rows,
        searchable = false;
      if (grouped && !section) {
        const groups = new Map();
        rows = [];
        for (const option of options) {
          if (!option.section) {
            rows.push(option);
            continue;
          }
          let group = groups.get(option.section);
          if (!group) {
            group = {
              key: "section-" + groups.size,
              opens: option.section,
              count: 0,
              activeLabel: "",
            };
            groups.set(option.section, group);
            rows.push(group);
          }
          group.count++;
          if (option.index === value) group.activeLabel = option.label;
        }
      } else {
        const items = grouped
          ? options.filter((o) => o.section === section)
          : options;
        searchable = items.length > 8;
        const term = query.trim().toLowerCase();
        rows = term
          ? items.filter((o) => o.label.toLowerCase().includes(term))
          : items;
      }
      this.setData({
        rows,
        query,
        searchable,
        anchor:
          !query && rows.some((row) => row.index === value)
            ? "option-" + value
            : "",
      });
    },
    enterSection(e) {
      this.setData({ section: e.currentTarget.dataset.section });
      this.updateRows("");
    },
    backToGroups() {
      this.setData({ section: "" });
      this.updateRows("");
    },
    search(e) {
      this.updateRows(e.detail.value);
    },
    close() {
      this.setData({
        opened: false,
        query: "",
        rows: [],
        anchor: "",
        section: "",
        searchable: false,
      });
    },
    pick(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (
        !this.data.opened ||
        this.data.disabled ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= this.data.range.length
      )
        return;
      this.close();
      this.triggerEvent("change", { value: index });
    },
  },
});
