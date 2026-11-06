const { paint } = require("../../lib/share-card-paint");
Component({
  lifetimes: {
    detached() {
      this.gone = true;
    },
  },
  methods: {
    render(model) {
      this.queue = (this.queue || Promise.resolve())
        .catch(() => {})
        .then(() => this.drawCard(model));
      return this.queue;
    },
    async drawCard(model) {
      const canvas = await new Promise((resolve) =>
        this.createSelectorQuery()
          .select("#share-art")
          .fields({ node: true })
          .exec((rows) => resolve(rows[0]?.node)),
      );
      if (!canvas || this.gone) return "";
      canvas.width = 1200;
      canvas.height = 960;
      const context = canvas.getContext("2d");
      context.scale(2, 2);
      let cover = null;
      if (model.cover)
        cover = await new Promise((resolve) => {
          const image = canvas.createImage();
          const timer = setTimeout(() => resolve(null), 2500);
          image.onload = () => {
            clearTimeout(timer);
            resolve({ path: image, width: image.width, height: image.height });
          };
          image.onerror = () => {
            clearTimeout(timer);
            resolve(null);
          };
          image.src = model.cover;
        });
      if (this.gone) return "";
      // Thin adapter keeps card layout shared with local Canvas visual checks.
      paint(
        {
          setFillStyle: (value) => {
            context.fillStyle = value;
          },
          setFontSize: (value) => {
            context.font = value + "px sans-serif";
          },
          fillRect: (...args) => context.fillRect(...args),
          fillText: (...args) => context.fillText(...args),
          measureText: (value) => context.measureText(value),
          drawImage: (...args) => context.drawImage(...args),
        },
        model,
        cover,
      );
      return new Promise((resolve) =>
        wx.canvasToTempFilePath(
          {
            canvas,
            width: 1200,
            height: 960,
            destWidth: 1200,
            destHeight: 960,
            fileType: "jpg",
            quality: 0.9,
            success: (r) => resolve(r.tempFilePath),
            fail: () => resolve(""),
          },
          this,
        ),
      );
    },
  },
});
