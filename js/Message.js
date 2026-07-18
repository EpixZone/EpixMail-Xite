(function() {

  // One row in a conversation list. Thread rows come from ThreadStore.threads
  // (stable key "conv-" + conv_id); sent rows are flat per-message entries.
  class Message {
    constructor(message_list, row) {
      this.message_list = message_list;
      this.row = row;
      this.active = false;
      this.key = row.key;
      this.read = this.isThreadRead();
      this.handleListClick = this.handleListClick.bind(this);
      this.handleStarClick = this.handleStarClick.bind(this);
      this.handleReadToggleClick = this.handleReadToggleClick.bind(this);
      this.handleArchiveClick = this.handleArchiveClick.bind(this);
      this.handleJunkClick = this.handleJunkClick.bind(this);
      this.handleDeleteClick = this.handleDeleteClick.bind(this);
      this.renderBodyPreview = this.renderBodyPreview.bind(this);
    }

    isThreadRead() {
      if (this.row.folder === "sent") return true;
      return Page.thread_store.isThreadRead(this.row);
    }

    displayXid(name) {
      return name ? name.replace(/\.[^.]+$/, "") : name;
    }

    getBodyPreview() {
      return (this.row.body || "").replace(/\s+/g, " ").substring(0, 120);
    }

    renderBodyPreview(node) {
      node.textContent = this.getBodyPreview();
    }

    // "Alice", "Alice, me", "Bob, Carol, me": senders in order of first
    // appearance, then members who haven't written yet
    getParticipantsLabel() {
      var my_xid = Crypto.normalizeXid(Page.user.getMyXid());
      var names = [];
      var seen = {};
      var add = (xid) => {
        xid = Crypto.normalizeXid(xid);
        if (!xid || seen[xid]) return;
        seen[xid] = true;
        names.push(xid === my_xid ? _("me") : this.displayXid(xid));
      };
      if (this.row.folder === "sent") {
        var members = this.row.members || [];
        for (var i = 0; i < members.length; i++) {
          if (members[i] !== my_xid) add(members[i]);
        }
        if (names.length === 0) add(my_xid);
        return names.join(", ");
      }
      var msgs = this.row.thread_messages || [];
      for (var mi = 0; mi < msgs.length; mi++) {
        add(msgs[mi].from_xid);
      }
      var all = this.row.members || [];
      for (var ai = 0; ai < all.length; ai++) {
        add(all[ai]);
      }
      return names.join(", ");
    }

    // Avatar of the first non-self participant; groups get a stacked pair
    renderRowAvatar() {
      var my_xid = Crypto.normalizeXid(Page.user.getMyXid());
      var members = this.row.members || [];
      var others = [];
      for (var i = 0; i < members.length; i++) {
        if (members[i] !== my_xid) others.push(members[i]);
      }
      if (others.length === 0) others = [my_xid];
      return h("span.row-avatar", {classes: {group: others.length > 1}}, [
        Page.renderXidAvatar(others[0]),
        others.length > 1 ? Page.renderXidAvatar(others[1]) : null
      ]);
    }

    handleListClick(e) {
      if (this.row.folder !== "sent") {
        Page.thread_store.markThreadRead(this.row);
        this.read = true;
      }
      Page.navigate("?Thread/" + this.row.conv_id);
      return false;
    }

    handleStarClick(e) {
      if (e) e.stopPropagation();
      Page.thread_store.toggleStar(this.row.conv_id);
      return false;
    }

    handleReadToggleClick(e) {
      if (e) e.stopPropagation();
      if (this.read) {
        Page.thread_store.markThreadUnread(this.row);
        this.read = false;
      } else {
        Page.thread_store.markThreadRead(this.row);
        this.read = true;
      }
      return false;
    }

    handleArchiveClick(e) {
      if (e) e.stopPropagation();
      Page.thread_store.setArchived(this.row.conv_id, this.row.folder !== "archived");
      return false;
    }

    canJunk() {
      var my_xid = Crypto.normalizeXid(Page.user.getMyXid());
      return this.row.initiator && this.row.initiator !== my_xid;
    }

    handleJunkClick(e) {
      if (e) e.stopPropagation();
      Page.thread_store.setJunkSender(this.row.initiator, this.row.folder !== "junk");
      return false;
    }

    handleDeleteClick(e) {
      if (e) e.stopPropagation();
      this.message_list.deleteMessage(this);
      return false;
    }

    renderActions() {
      if (this.row.folder === "sent") {
        return h("div.row-actions", [
          h("a.icon.icon-trash", {href: "#Delete", title: _("Delete"), onclick: this.handleDeleteClick})
        ]);
      }
      var is_archived = this.row.folder === "archived";
      var is_junk = this.row.folder === "junk";
      return h("div.row-actions", [
        h("a.icon", {
          href: "#Read",
          title: this.read ? _("Mark as unread") : _("Mark as read"),
          classes: {"icon-mail-open": this.read, "icon-mail": !this.read},
          onclick: this.handleReadToggleClick
        }),
        h("a.icon.icon-archive", {
          href: "#Archive",
          title: is_archived ? _("Unarchive") : _("Archive"),
          classes: {active: is_archived},
          onclick: this.handleArchiveClick
        }),
        this.canJunk() ? h("a.icon.icon-junk", {
          href: "#Junk",
          title: is_junk ? _("Not spam") : _("Report spam"),
          classes: {active: is_junk},
          onclick: this.handleJunkClick
        }) : null,
        h("a.icon.icon-trash", {href: "#Delete", title: _("Delete"), onclick: this.handleDeleteClick})
      ]);
    }

    renderList() {
      var row = this.row;
      var is_sent_row = row.folder === "sent";
      var unread = !is_sent_row && !this.read;
      return h("div.thread-row", {
        key: this.key,
        disableAnimation: row.disable_animation,
        enterAnimation: Animation.slideDown,
        exitAnimation: Animation.slideUp,
        onclick: this.handleListClick,
        classes: {unread: unread, active: this.active}
      }, [
        this.renderRowAvatar(),
        is_sent_row ? null : h("a.row-star.icon", {
          href: "#Star",
          title: row.starred ? _("Unstar") : _("Star"),
          classes: {"icon-star": !row.starred, "icon-star-filled": row.starred, active: row.starred},
          onclick: this.handleStarClick
        }),
        h("div.row-main", [
          h("div.row-top", [
            unread ? h("span.unread-dot") : null,
            h("span.participants", this.getParticipantsLabel()),
            row.thread_count > 1 ? h("span.thread-count", String(row.thread_count)) : null,
            h("span.row-time", Time.since(row.date_added))
          ]),
          h("div.row-snippet", [
            row.subject ? h("span.subject", row.subject) : null,
            row.subject && row.body ? h("span.sep", " - ") : null,
            h("span.preview", {afterCreate: this.renderBodyPreview, updateAnimation: this.renderBodyPreview}, [this.getBodyPreview()])
          ])
        ]),
        this.renderActions()
      ]);
    }
  }

  window.Message = Message;

})();
