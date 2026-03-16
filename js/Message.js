(function() {

  class Message {
    constructor(message_list, row) {
      this.message_list = message_list;
      this.row = row;
      this.active = false;
      this.selected = false;
      this.deleted = false;
      this.key = row.key;
      if (row.folder === "sent" || Page.local_storage.read[row.date_added]) {
        this.read = true;
      } else {
        this.read = false;
      }
      this.handleListClick = this.handleListClick.bind(this);
      this.handleDeleteClick = this.handleDeleteClick.bind(this);
      this.handleReplyClick = this.handleReplyClick.bind(this);
      this.handleContactClick = this.handleContactClick.bind(this);
      this.renderBody = this.renderBody.bind(this);
      this.renderBodyPreview = this.renderBodyPreview.bind(this);
    }

    getBodyPreview() {
      return this.row.body.substring(0, 81);
    }

    markRead(read) {
      if (read === undefined) read = true;
      if (!this.read) {
        Page.local_storage.read[this.row.date_added] = true;
        Page.saveLocalStorage();
      }
      this.read = read;
    }

    handleListClick(e) {
      this.markRead();
      if (e && e.ctrlKey) {
        this.selected = !this.selected;
        if (this.message_list.message_lists.message_active) {
          this.message_list.message_lists.message_active.active = false;
          this.message_list.message_lists.message_active.selected = true;
          this.message_list.message_lists.message_active = null;
          Page.message_show.message = null;
        }
        this.message_list.updateSelected();
      } else if (e && e.shiftKey) {
        if (this.message_list.message_lists.message_active) {
          var active_index = this.message_list.messages.indexOf(this.message_list.message_lists.message_active);
          var my_index = this.message_list.messages.indexOf(this);
          var start = Math.min(active_index, my_index);
          var end = Math.max(active_index, my_index);
          for (var i = start; i <= end; i++) {
            this.message_list.messages[i].selected = true;
          }
        }
        this.message_list.updateSelected();
      } else {
        this.message_list.setActiveMessage(this);
        Page.message_show.setMessage(this);
      }
      return false;
    }

    handleDeleteClick() {
      this.message_list.deleteMessage(this);
      this.message_list.save();
      return false;
    }

    handleReplyClick() {
      Page.message_create.setReplyDetails();
      Page.message_create.show();
      return false;
    }

    renderBody(node) {
      node.innerHTML = Text.renderMarked(this.row.body, {"sanitize": true});
    }

    renderBodyPreview(node) {
      node.textContent = this.getBodyPreview();
    }

    handleContactClick(e) {
      Page.message_create.show(e.currentTarget.querySelector(".name").textContent);
      return false;
    }

    renderUsernameLink(username, address) {
      if (username == null) username = "n/a";
      return h("a.username", {href: Page.createUrl("to", username), onclick: this.handleContactClick},
        this.renderUsername(username, address)
      );
    }

    renderUsername(username, address) {
      var color = Text.toColor(address || username || "");
      return [
        h("span.name", {"title": address || username, "style": "color: " + color}, [username])
      ];
    }

    displayXid(name) {
      return name ? name.replace(/\.[^.]+$/, "") : name;
    }

    renderXidName(xid_name) {
      var color = Text.toColor(xid_name || "");
      return [
        h("span.name", {"style": "color: " + color}, [xid_name]),
        h("span.encrypted-badge", {title: "End-to-end encrypted"}, ["\uD83D\uDD12"])
      ];
    }

    renderList() {
      return h("a.Message", {
        "key": this.key, "href": "#MessageShow:" + this.row.key,
        "onclick": this.handleListClick, "disableAnimation": this.row.disable_animation,
        "enterAnimation": Animation.slideDown, "exitAnimation": Animation.slideUp,
        classes: { "active": this.active, "selected": this.selected, "unread": !this.read }
      }, [
        h("div.sent", [Time.since(this.row.date_added)]),
        h("div.subject", [this.row.subject]),
        this.row.folder === "sent"
          ? h("div.to.username", ["To: ", this.renderUsername(this.displayXid(this.row.peer_xid) || this.row.to, this.row.to_address)])
          : h("div.from.username", ["From: ", this.renderUsername(this.displayXid(this.row.from_xid) || this.row.from, this.row.from_address)]),
        h("div.preview", {"afterCreate": this.renderBodyPreview, "updateAnimation": this.renderBodyPreview}, [this.row.body])
      ]);
    }

    renderShow() {
      return h("div.Message", {"key": this.key, "enterAnimation": Animation.show, "classes": {"deleted": this.deleted}}, [
        h("div.tools", [
          h("a.icon.icon-reply", {href: "#Reply", "title": "Reply message", onclick: this.handleReplyClick}),
          h("a.icon.icon-trash", {href: "#Delete", "title": "Delete message", onclick: this.handleDeleteClick})
        ]),
        h("div.subject", [this.row.subject]),
        h("div.sent", [Time.date(this.row.date_added, "full")]),
        this.row.folder === "sent"
          ? h("div.to.username", ["To: ", this.renderUsernameLink(this.displayXid(this.row.peer_xid) || this.row.to, this.row.to_address)])
          : h("div.from.username", ["From: ", this.renderUsernameLink(this.displayXid(this.row.from_xid) || this.row.from, this.row.from_address)]),
        h("div.body", {"afterCreate": this.renderBody, "updateAnimation": this.renderBody}, [this.row.body])
      ]);
    }
  }

  window.Message = Message;

})();
