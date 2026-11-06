Component({
  data: {
    current: "",
    tabs: [
      { page: "pages/activities/index", label: "活动" },
      { page: "pages/library/index", label: "书影" },
      { page: "pages/bookstores/index", label: "树洞" },
      { page: "pages/profile/index", label: "我的" },
    ],
  },
  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      this.selectPage(pages[pages.length - 1]?.route);
    },
  },
  methods: {
    selectPage(route) {
      if (route && route !== this.data.current) this.setData({ current: route });
    },
  },
});
