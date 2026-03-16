(function() {

  class MessageLists {
    constructor() {
      this.inbox = new MessageListInbox(this);
      this.sent = new MessageListSent(this);
      this.active = this.inbox;
      this.message_active = null;
    }

    getActive() {
      return this.active;
    }

    setActive(name) {
      this.active.deselectMessages();
      this.active = this[name];
      this.active.triggerLoad();
      Page.projector.scheduleRender();
      return this.active;
    }

    getActiveMessage() {
      return this.getActive().message_active;
    }

    render() {
      return h("div.MessageLists", [this.active.render()]);
    }

    onSiteInfo(site_info) {
      this.sent.reload = true;
      this.inbox.reload = true;
      this.active.triggerLoad();
    }
  }

  Object.assign(MessageLists.prototype, LogMixin);
  window.MessageLists = MessageLists;

})();
