const api = require("./api");
const sharing = require("./sharing");

// Keep native views mounted during navigation, but never across identities.
function retain(options) {
  return {
    ...options,
    onLoad(query) {
      this._gone = false;
      this._session = api.sessionGeneration();
      const initial = JSON.parse(JSON.stringify(this.data));
      const setData = this.setData.bind(this);
      this.setData = (patch, callback) => {
        if (!this._gone && this._session === api.sessionGeneration())
          setData(patch, callback);
      };
      this._unwatch = api.onSessionChange(() => {
        sharing.cancel(this);
        const empty = Object.fromEntries(Object.keys(this.data).map(key => [key, null]));
        setData({...empty, ...initial, authorized: false, busy: false});
      });
      options.onLoad?.call(this, query);
    },
    onShow() {
      this._visible = true;
      if (this._session !== api.sessionGeneration()) {
        wx.reLaunch({url: "/pages/login/index"});
        return;
      }
      return options.onShow?.call(this);
    },
    onHide() {
      this._visible = false;
      sharing.cancel(this);
      options.onHide?.call(this);
    },
    onUnload() {
      this._gone = true;
      this._unwatch?.();
      sharing.cancel(this);
      options.onUnload?.call(this);
    },
  };
}
module.exports = {retain};
