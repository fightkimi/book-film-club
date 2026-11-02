const C = require("../../lib/page");
C.define({
  ready({ state }) {
    this.setData({ group: state.group });
  },
});
