Component({
  properties: {
    cover: Object,
    title: String,
  },
  data: { failedImage: "" },
  methods: {
    imageError(e) {
      if (e.currentTarget.dataset.src === this.data.cover?.image) {
        this.setData({ failedImage: e.currentTarget.dataset.src });
      }
    },
  },
});
