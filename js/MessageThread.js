(function() {

  // Full conversation view (?Thread/<conv_id>): messages oldest to newest
  // with a Gmail-style collapse for long threads, and an inline reply box.
  // Replies always go to every member of the conversation (reply-all), so
  // the whole group can read the thread like a WhatsApp/Signal chat.
  class MessageThread {
    constructor() {
      this.conv_id = null;
      this.expanded = false;
      this.reply_body = "";
      this.sending = false;
      this.just_sent = false;
      this.marked_read = null;
      this.node = null;
      this._body_renderers = {};
      this.setNode = this.setNode.bind(this);
      this.handleBackClick = this.handleBackClick.bind(this);
      this.handleExpandClick = this.handleExpandClick.bind(this);
      this.handleStarClick = this.handleStarClick.bind(this);
      this.handleUnreadClick = this.handleUnreadClick.bind(this);
      this.handleArchiveClick = this.handleArchiveClick.bind(this);
      this.handleJunkClick = this.handleJunkClick.bind(this);
      this.handleDeleteClick = this.handleDeleteClick.bind(this);
      this.handleReplyInput = this.handleReplyInput.bind(this);
      this.handleReplySend = this.handleReplySend.bind(this);
      this.renderThreadMessage = this.renderThreadMessage.bind(this);
    }

    setNode(node) {
      this.node = node;
    }

    setConvId(conv_id) {
      if (this.conv_id !== conv_id) {
        this.expanded = false;
        this.reply_body = "";
        this.sending = false;
        this.just_sent = false;
        this._body_renderers = {};
        this._tried_nolimit = false;
      }
      // Re-evaluate the mark-read guard on every open, so reopening a thread
      // that was manually marked unread (same conv, same count) marks it read.
      this.marked_read = null;
      this.conv_id = conv_id;
      Page.thread_store.load();
    }

    getThread() {
      return Page.thread_store.getThread(this.conv_id);
    }

    displayXid(name) {
      return name ? name.replace(/\.[^.]+$/, "") : name;
    }

    getOthers(thread) {
      var my_xid = Crypto.normalizeXid(Page.user.getMyXid());
      return (thread.members || []).filter(function(m) {
        return m !== my_xid;
      });
    }

    handleBackClick() {
      Page.navigate("?" + (Page.last_folder_url || "Inbox"));
      return false;
    }

    handleExpandClick() {
      this.expanded = true;
      Page.projector.scheduleRender();
      return false;
    }

    handleStarClick() {
      Page.thread_store.toggleStar(this.conv_id);
      return false;
    }

    // Gmail-style: marking the open conversation unread returns you to the
    // list. Pinning marked_read stops the render below from re-marking it read
    // in the same frame.
    handleUnreadClick() {
      var thread = this.getThread();
      if (thread) {
        this.marked_read = this.conv_id + ":" + thread.thread_count;
        Page.thread_store.markThreadUnread(thread);
        this.handleBackClick();
      }
      return false;
    }

    handleArchiveClick() {
      var thread = this.getThread();
      if (thread) {
        Page.thread_store.setArchived(this.conv_id, thread.folder !== "archived");
      }
      return false;
    }

    handleJunkClick() {
      var thread = this.getThread();
      if (thread) {
        Page.thread_store.setJunkSender(thread.initiator, thread.folder !== "junk");
      }
      return false;
    }

    handleDeleteClick() {
      var thread = this.getThread();
      if (thread) {
        Page.thread_store.deleteThread(thread);
        this.handleBackClick();
      }
      return false;
    }

    handleReplyInput(e) {
      this.reply_body = e.target.value;
      return false;
    }

    handleReplySend() {
      var thread = this.getThread();
      if (!thread || this.sending || !this.reply_body.trim()) return false;
      var others = this.getOthers(thread);
      var subject = thread.subject ? "Re: " + thread.subject.replace(/^(Re: )+/, "") : "";
      this.sending = true;
      // The encrypting effect: the reply text scrambles into Braille glyphs
      // while the message is encrypted per member and signed
      var textarea = this.node && this.node.querySelector(".reply-body");
      if (textarea) Animation.scramble(textarea);
      Page.projector.scheduleRender();
      var recipients = others.length ? others : [Crypto.normalizeXid(Page.user.getMyXid())];
      // Reply into the thread's representative id (the newest merged
      // conversation), not whatever id the URL happened to carry, so the
      // reply stays in the coalesced thread and reunifies split legacy ones.
      var reply_conv_id = thread.conv_id || this.conv_id;
      Page.user.sendMessage(recipients, subject, this.reply_body, reply_conv_id, (res) => {
        this.sending = false;
        if (res) {
          this.reply_body = "";
          this.just_sent = true;
          setTimeout(() => {
            this.just_sent = false;
            Page.projector.scheduleRender();
          }, 3000);
          // The node never echoes our own file_done: refresh explicitly
          Page.thread_store.invalidate();
          Page.thread_store.load("noanim");
        } else if (textarea) {
          textarea.value = this.reply_body;
        }
        Page.projector.scheduleRender();
      });
      return false;
    }

    getBodyRenderer(msg) {
      var key = msg.msg_key;
      if (!this._body_renderers[key]) {
        this._body_renderers[key] = function(node) {
          node.innerHTML = Text.renderMarked(msg.body, {"sanitize": true});
        };
      }
      return this._body_renderers[key];
    }

    renderThreadMessage(msg) {
      var my_xid = Crypto.normalizeXid(Page.user.getMyXid());
      var from = Crypto.normalizeXid(msg.from_xid);
      var is_mine = from === my_xid;
      var renderBody = this.getBodyRenderer(msg);
      return h("div.thread-message", {key: "tm-" + msg.msg_key, classes: {mine: is_mine}}, [
        Page.renderXidAvatar(from),
        h("div.thread-message-main", [
          h("div.thread-message-head", [
            h("span.sender", {style: "color: " + Text.toColor(from)}, is_mine ? _("me") : this.displayXid(from)),
            h("span.msg-time", {title: Time.date(msg.date_added, "full")}, Time.since(msg.date_added))
          ]),
          h("div.thread-message-body", {afterCreate: renderBody, updateAnimation: renderBody}, [msg.body])
        ])
      ]);
    }

    getVisibleMessages(thread) {
      var msgs = thread.thread_messages;
      if (this.expanded || msgs.length <= 6) {
        return {msgs: msgs, hidden: 0};
      }
      // Gmail-style collapse: the first message + the last 4
      return {msgs: [msgs[0]].concat(msgs.slice(-4)), hidden: msgs.length - 5};
    }

    renderNotFound() {
      var store = Page.thread_store;
      // A deep link (bookmark, EpixPost link, back after restart) can point at
      // a conversation outside the newest-20 window: load the whole mailbox
      // once before giving up.
      if (store.loaded && !store.loading && !store.nolimit && !this._tried_nolimit) {
        this._tried_nolimit = true;
        store.nolimit = true;
        store.invalidate();
        store.load("noanim");
      }
      if (!store.loaded || store.loading) {
        return h("div.list-empty.loading", [
          h("span.spinner"),
          h("div.empty-title", _("Decrypting your mailbox..."))
        ]);
      }
      return h("div.list-empty", [
        h("div.empty-title", _("Conversation not found")),
        h("a.link", {href: "?Inbox", onclick: Page.handleLinkClick}, _("Back to Inbox"))
      ]);
    }

    render() {
      var thread = this.getThread();
      if (!thread) {
        return h("div.MessageThread", {key: "thread-missing", afterCreate: this.setNode}, [this.renderNotFound()]);
      }
      // Opening (or receiving into) the thread marks everything read
      var read_key = this.conv_id + ":" + thread.thread_count;
      if (this.marked_read !== read_key) {
        this.marked_read = read_key;
        Page.thread_store.markThreadRead(thread);
      }
      var my_xid = Crypto.normalizeXid(Page.user.getMyXid());
      var others = this.getOthers(thread);
      var names = others.map(this.displayXid);
      names.push(_("me"));
      var visible = this.getVisibleMessages(thread);
      var is_archived = thread.folder === "archived";
      var is_junk = thread.folder === "junk";
      var can_junk = thread.initiator && thread.initiator !== my_xid;
      return h("div.MessageThread", {key: "thread-" + this.conv_id, afterCreate: this.setNode}, [
        h("div.thread-header", [
          h("a.icon.icon-back", {href: "#Back", title: _("Back"), onclick: this.handleBackClick}),
          h("div.thread-title", [
            h("h2.thread-subject", [
              thread.subject || _("(no subject)"),
              h("span.encrypted-badge.icon.icon-lock", {title: _("End-to-end encrypted")})
            ]),
            h("div.thread-participants", names.join(", "))
          ]),
          h("div.thread-actions", [
            h("a.icon.icon-mail", {
              href: "#Unread",
              title: _("Mark as unread"),
              onclick: this.handleUnreadClick
            }),
            h("a.icon", {
              href: "#Star",
              title: thread.starred ? _("Unstar") : _("Star"),
              classes: {"icon-star": !thread.starred, "icon-star-filled": thread.starred, active: thread.starred},
              onclick: this.handleStarClick
            }),
            h("a.icon.icon-archive", {
              href: "#Archive",
              title: is_archived ? _("Unarchive") : _("Archive"),
              classes: {active: is_archived},
              onclick: this.handleArchiveClick
            }),
            can_junk ? h("a.icon.icon-junk", {
              href: "#Junk",
              title: is_junk ? _("Not spam") : _("Report spam"),
              classes: {active: is_junk},
              onclick: this.handleJunkClick
            }) : null,
            h("a.icon.icon-trash", {href: "#Delete", title: _("Delete"), onclick: this.handleDeleteClick})
          ])
        ]),
        visible.hidden > 0 ? h("a.thread-expand", {href: "#Expand", onclick: this.handleExpandClick},
          _("Show {n} earlier messages").replace("{n}", String(visible.hidden))
        ) : null,
        h("div.thread-messages", visible.msgs.map(this.renderThreadMessage)),
        h("div.reply-box", {classes: {sent: this.just_sent}}, [
          h("div.reply-to", [
            h("span.icon.icon-reply"),
            this.just_sent
              ? h("span.reply-sent-note", _("Message sent!"))
              : h("span", _("Reply to") + " " + (others.length ? names.slice(0, -1).join(", ") : _("me")))
          ]),
          h("textarea.reply-body", {
            placeholder: _("Write a reply..."),
            value: this.reply_body,
            oninput: this.handleReplyInput
          }),
          h("div.reply-foot", [
            h("span.encrypt-note", [
              h("span.icon.icon-lock"),
              _("End-to-end encrypted")
            ]),
            h("a.button.button-submit.reply-send", {
              href: "#Send",
              classes: {disabled: !this.reply_body.trim(), loading: this.sending},
              onclick: this.handleReplySend
            }, _("Encrypt & Send"))
          ])
        ])
      ]);
    }
  }

  Object.assign(MessageThread.prototype, LogMixin);
  window.MessageThread = MessageThread;

})();
