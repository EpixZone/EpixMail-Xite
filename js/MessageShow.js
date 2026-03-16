(function() {

  class MessageShow {
    constructor() {
      this.message = null;
      this.handleMultiDeleteClick = this.handleMultiDeleteClick.bind(this);
    }

    setMessage(message) {
      this.message = message;
      Page.projector.scheduleRender();
    }

    handleMultiDeleteClick() {
      var selected = Page.message_lists.active.selected;
      for (var i = 0; i < selected.length; i++) {
        Page.message_lists.active.deleteMessage(selected[i]);
      }
      Page.message_lists.active.save();
      Page.message_lists.active.deselectMessages();
      return false;
    }

    render() {
      return h("div.MessageShow", [
        (!Page.user.publickey && (!Page.site_info || !Page.site_info.cert_user_id || Page.user.inited || !Page.user.loaded.resolved))
          ? start_screen.renderNocert()
          : (Page.message_lists.getActive().selected.length > 0)
            ? h("div.selected", {"enterAnimation": Animation.show}, [
                h("a.icon.icon-trash.button-delete", {href: "#Delete", "title": "Delete messages", onclick: this.handleMultiDeleteClick},
                  ["Delete " + Page.message_lists.getActive().selected.length + " selected messages"]
                )
              ])
            : this.message
              ? this.message.renderShow()
              : (Page.message_lists.getActive().messages.length > 0 || !Page.message_lists.getActive().loaded)
                ? h("div.empty", {"enterAnimation": Animation.show}, ["No message selected"])
                : ((Page.site_info && Page.site_info.cert_user_id) || Page.user.publickey) && Page.user.loaded.result
                  ? start_screen.renderNomessage()
                  : h("div")
      ]);
    }
  }

  Object.assign(MessageShow.prototype, LogMixin);
  window.MessageShow = MessageShow;

})();
