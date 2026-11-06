const api = require("../../lib/api");
const gatherings = require("../../lib/gatherings");
const artwork = require("../../lib/static-assets");
const sharing = require("../../lib/sharing");

Page({
  onShareAppMessage: sharing.message,
  onReady() { sharing.enable(); sharing.prepare(this); },
  onShow() {
    if (this.returnTarget && api.hasSession()) sharing.resume(this.returnTarget);
  },
  data: { busy: false, error: "", invited: false, entryArtwork: artwork.login },

  onLoad(options) {
    options = sharing.decodeQuery(options);
    this.returnTarget = sharing.validate(options.target);
    this.invite = options.invite || "";
    this.eventId = options.event && gatherings.valid(options.event) ? options.event : "";
    this.circleOnly = options.circle === "1";
    this.toTree = options.next === "tree" || options.scene === "tree";
    this.toLibrary = options.next === "library";
    this.setData({ invited: Boolean(this.invite) });
  },

  async submit(event) {
    if (this.data.busy) return;
    const useExisting = event.currentTarget.dataset.identity === "existing";
    this.setData({ busy: true, error: "" });
    try {
      if(this.eventId && !this.invite){
        if(this.circleOnly) await api.loginWithWeChat();
        await gatherings.verify(this.eventId);
        wx.redirectTo({url:"/pages/bookstore-gathering/index?id="+this.eventId+"&circle="+(this.circleOnly?"1":"0")});
        return;
      }
      await api.loginWithWeChat(useExisting ? "" : this.invite);
      this.invite = "";
      if (sharing.resume(this.returnTarget)) return;
      wx.switchTab({ url: this.toLibrary ? "/pages/library/index" : this.toTree ? "/pages/bookstores/index" : "/pages/activities/index" });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ busy: false });
    }
  },
});
