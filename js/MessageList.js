(function() {

  class MessageList {
    constructor(message_lists) {
      this.message_lists = message_lists;
      this.title = "Unknown";
      this.loading = false;
      this.loaded = false;
      this.has_more = false;
      this.loading_message = "Loading...";
      this.messages = [];
      this.selected = [];
      this.message_db = {};
      this.handleMoreClick = this.handleMoreClick.bind(this);
    }

    triggerLoad() {
      // Override in subclasses
    }

    getMessages() {
      return this.messages;
    }

    setActiveMessage(message) {
      if (this.message_lists.message_active) {
        this.message_lists.message_active.active = false;
      }
      message.active = true;
      this.message_lists.message_active = message;
      this.deselectMessages();
    }

    deselectMessages() {
      for (var i = 0; i < this.selected.length; i++) {
        this.selected[i].selected = false;
      }
      this.updateSelected();
    }

    updateSelected() {
      this.selected = this.messages.filter(function(message) { return message.selected; });
    }

    addMessage(message_row, index) {
      if (index === undefined) index = -1;
      var message = new Message(this, message_row);
      this.message_db[message_row.key] = message;
      if (index >= 0) {
        this.messages.splice(index, 0, message);
      } else {
        this.messages.push(message);
      }
      return message;
    }

    deleteMessage(message) {
      message.deleted = true;
      var index = this.messages.indexOf(message);
      if (index > -1) {
        this.messages.splice(index, 1);
      }
    }

    syncMessages(message_rows) {
      var last_obj = null;
      for (var i = 0; i < message_rows.length; i++) {
        var message_row = message_rows[i];
        var current_obj = this.message_db[message_row.key];
        if (current_obj) {
          current_obj.row = message_row;
          last_obj = current_obj;
        } else {
          if (last_obj) {
            last_obj = this.addMessage(message_row, this.messages.indexOf(last_obj) + 1);
          } else {
            last_obj = this.addMessage(message_row, 0);
          }
        }
      }
    }

    setLoadingMessage(msg) {
      this.loading_message = msg;
      Page.projector.scheduleRender();
    }

    handleMoreClick() {
      this.reload = true;
      this.triggerLoad("nolimit");
      return false;
    }

    render() {
      var has_cert = (Page.site_info && Page.site_info.cert_user_id) || this.loaded || this.loading;
      var messages = has_cert ? this.messages : [];
      if (messages.length > 0) {
        return h("div.MessageList", {"key": this.title},
          messages.map(function(message) {
            return message.renderList();
          }).concat([
            h("a.more", {href: "#More", classes: {"visible": this.has_more, "loading": this.loading}, onclick: this.handleMoreClick}, "Load more messages")
          ])
        );
      } else if (this.loading) {
        return h("div.MessageList", {"key": this.title}, [
          h("div.empty", [
            this.title + ": " + this.loading_message,
            h("span.cursor", ["_"])
          ])
        ]);
      } else {
        return h("div.MessageList", {"key": this.title}, [
          h("div.empty", [
            this.title + ": No messages",
            h("span.cursor", ["_"])
          ])
        ]);
      }
    }
  }

  Object.assign(MessageList.prototype, LogMixin);
  window.MessageList = MessageList;

})();
