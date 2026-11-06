Component({
  properties: { value: String, disabled: Boolean },
  data: {
    opened: false,
    year: 2026,
    months: Array.from({ length: 12 }, (_, i) => i + 1),
  },
  pageLifetimes: {
    hide() {
      this.close();
    },
  },
  methods: {
    open() {
      if (this.data.disabled) return;
      const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      this.overlayTabBar = pages[pages.length - 1]?.getTabBar?.();
      this.overlayTabBar?.setData({ covered: true });
      const value = /^(\d{4})-(\d{2})$/.exec(this.data.value || "");
      this.setData({
        opened: true,
        year: value ? Number(value[1]) : new Date().getFullYear(),
        chosenMonth: value ? Number(value[2]) : 0,
        chosenYear: value ? Number(value[1]) : 0,
      });
    },
    close() {
      this.overlayTabBar?.setData({ covered: false });
      this.overlayTabBar = null;
      this.setData({ opened: false });
    },
    year(e) {
      const year = this.data.year + Number(e.currentTarget.dataset.step);
      if (year >= 1900 && year <= 2100) this.setData({ year });
    },
    pick(e) {
      if (!this.data.opened || this.data.disabled) return;
      const month = Number(e.currentTarget.dataset.month);
      if (!Number.isInteger(month) || month < 1 || month > 12) return;
      const value = this.data.year + "-" + String(month).padStart(2, "0");
      this.close();
      this.triggerEvent("change", { value });
    },
  },
});
