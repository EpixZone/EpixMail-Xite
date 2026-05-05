(function() {

  class MessageCreate {
    constructor() {
      this.subject = "";
      this.body = "";
      this.minimized = true;
      this.sending = false;
      this.just_sent = false;
      this.to_value = "";
      this.to_valid = null;
      this.to_checking = false;
      this.reply_conv_id = null;
      this._validate_seq = 0;
      this.node = null;
      this.handleTitleClick = this.handleTitleClick.bind(this);
      this.handleCloseClick = this.handleCloseClick.bind(this);
      this.handleInput = this.handleInput.bind(this);
      this.handleToInput = this.handleToInput.bind(this);
      this.handleToBlur = this.handleToBlur.bind(this);
      this.handleSendClick = this.handleSendClick.bind(this);
      this.setNode = this.setNode.bind(this);
    }

    stripTld(name) {
      return name ? name.replace(/\.epix$/i, "") : name;
    }

    withTld(name) {
      return (name && !name.match(/\.epix$/i)) ? name + ".epix" : name;
    }

    get to() {
      return this.to_value;
    }

    set to(to) {
      this.to_value = this.stripTld(to);
      this.to_valid = null;
      this.to_checking = false;
      if (this.to_value) {
        this.validateTo(this.withTld(this.to_value));
      }
      Page.projector.scheduleRender();
    }

    isEmpty() {
      return !(this.body + this.subject + this.to);
    }

    isFilled() {
      return (this.body !== "" && this.subject !== "" && this.to !== "" && this.to_valid === true && Page.user.publickey);
    }

    setNode(node) {
      this.node = node;
    }

    setReplyDetails() {
      var current_message = Page.message_lists.message_active;
      var my_xid = Crypto.normalizeXid(Page.user.getMyXid());
      var from_xid = Crypto.normalizeXid(current_message.row.from_xid);
      if (from_xid === my_xid) {
        this.to = current_message.row.peer_xid;
      } else {
        this.to = current_message.row.from_xid;
      }
      this.reply_conv_id = current_message.row.conv_id;
      this.subject = "Re: " + current_message.row.subject.replace("Re: ", "");
    }

    getTitle() {
      var title;
      if (this.just_sent) {
        title = "Message sent!";
      } else if (this.isEmpty()) {
        if (Page.message_lists.message_active) {
          title = "Reply to this message";
        } else {
          title = "New message";
        }
      } else {
        if (this.subject.startsWith("Re:")) {
          title = "Reply to message";
        } else {
          title = "New message";
        }
      }
      return title;
    }

    validateTo(xid_name) {
      this.to_checking = true;
      this._validate_seq += 1;
      var seq = this._validate_seq;
      Page.projector.scheduleRender();
      Page.cmd("xidResolveName", [xid_name], (result) => {
        if (seq !== this._validate_seq) return;
        this.to_checking = false;
        this.to_valid = !!(result && !result.error);
        Page.projector.scheduleRender();
      });
    }

    show(to, subject, body) {
      if (to) this.to = to;
      if (subject) this.subject = subject;
      if (body) this.body = body;
      this.minimized = false;
      document.body.classList.add("MessageCreate-opened");
      if (!this.to) this.node.querySelector(".to").focus();
      else if (!this.subject) this.node.querySelector(".subject").focus();
      else if (!this.body) this.node.querySelector(".body").focus();
      return false;
    }

    hide() {
      document.body.classList.remove("MessageCreate-opened");
      this.minimized = true;
    }

    handleTitleClick(e) {
      e.cancelBubble = true;
      if (this.minimized) {
        if (this.isEmpty() && Page.message_lists.message_active) {
          this.setReplyDetails();
        }
        this.show();
      } else {
        this.hide();
      }
      return false;
    }

    handleCloseClick(e) {
      e.cancelBubble = true;
      this.hide();
      this.to_value = "";
      this.subject = "";
      this.body = "";
      this.to_valid = null;
      this.to_checking = false;
      this.reply_conv_id = null;
      return false;
    }

    handleInput(e) {
      this[e.target.name] = e.target.value;
      return false;
    }

    handleToInput(e) {
      this.to_value = this.stripTld(e.target.value);
      this.to_valid = null;
      this.to_checking = false;
      this._validate_seq += 1;
      return false;
    }

    handleToBlur(e) {
      var value = this.stripTld(e.target.value.trim());
      this.to_value = value;
      if (value) {
        this.validateTo(this.withTld(value));
      } else {
        this.to_valid = null;
        this.to_checking = false;
      }
      Page.projector.scheduleRender();
    }

    handleSendClick(e) {
      if (!this.to) {
        this.node.querySelector(".to").focus();
        return false;
      }
      var peer_xid = this.withTld(this.to);
      if (this.to_valid === false) {
        Page.cmd("wrapperNotification", ["error", "xID name '" + peer_xid + "' not found"]);
        return false;
      }
      if (this.to_checking) {
        Page.cmd("wrapperNotification", ["info", "Verifying xID name..."]);
        return false;
      }
      Animation.scramble(this.node.querySelector(".to"));
      Animation.scramble(this.node.querySelector(".subject"));
      Animation.scramble(this.node.querySelector(".body"));
      this.sending = true;
      this.log("Sending encrypted message to", peer_xid);
      var sent_subject = this.subject;
      var sent_body = this.body;
      var was_reply = !!this.reply_conv_id;
      Page.user.sendMessage(peer_xid, this.subject, this.body, this.reply_conv_id, (res) => {
        this.sending = false;
        if (res) {
          this.hide();
          this.just_sent = true;
          if (was_reply && Page.message_lists.message_active) {
            // Suppress the inbox reload triggered by saveData's file_done event
            Page.message_lists._suppress_inbox_reload = true;
            // Add sent message to the active thread in-place
            var active = Page.message_lists.message_active;
            if (active.row.thread_messages) {
              var my_xid = Crypto.normalizeXid(Page.user.getMyXid());
              var now = Date.now();
              var sent_row = {
                subject: sent_subject,
                body: sent_body,
                date_added: now,
                key: "msg-sent-" + now,
                message_id: "sent:" + now,
                from_xid: my_xid,
                peer_xid: peer_xid,
                from: my_xid,
                folder: "sent",
                conv_id: active.row.conv_id
              };
              active.row.thread_messages.push(sent_row);
              active.row.thread_count = active.row.thread_messages.length;
              // Update the inbox list entry: bump date and preview so it moves to top
              active.row.date_added = now;
              active.row.body = sent_body;
              active.row.subject = sent_subject;
              active.row.from_xid = my_xid;
              // Re-sort inbox messages so this thread moves to the top
              var inbox = Page.message_lists.inbox;
              inbox.messages.sort(function(a, b) { return b.row.date_added - a.row.date_added; });
            }
            Page.projector.scheduleRender();
          } else {
            Page.message_lists.inbox.reload = true;
          }
          setTimeout(() => {
            this.just_sent = false;
            this.to_value = "";
            this.subject = "";
            this.body = "";
            this.to_valid = null;
            this.reply_conv_id = null;
            Page.leftbar.reload_contacts = true;
            Page.projector.scheduleRender();
          }, 4000);
        } else {
          this.node.querySelector(".to").value = this.to;
          this.node.querySelector(".subject").value = this.subject;
          this.node.querySelector(".body").value = this.body;
        }
      });
      return false;
    }

    render() {
      var to_status = null;
      if (this.to_checking) {
        to_status = h("span.to-status.checking", [h("span.spinner"), " .epix"]);
      } else if (this.to_valid === true) {
        to_status = h("span.to-status.valid", [".epix \u2713"]);
      } else if (this.to_valid === false) {
        to_status = h("span.to-status.invalid", [".epix \u2717"]);
      } else {
        to_status = h("span.to-suffix", [".epix"]);
      }

      return h("div.MessageCreate", {classes: { minimized: this.minimized, empty: this.isEmpty(), sent: this.just_sent}, afterCreate: this.setNode}, [
        h("a.titlebar", {"href": "#New+message", onclick: this.handleTitleClick}, [
          h("span.text", [this.getTitle()]),
          h("span.buttons", [
            h("a.minimize", {href: "#Minimize", onclick: this.handleTitleClick}, ["_"]),
            h("a.close", {href: "#Close", onclick: this.handleCloseClick}, ["\u00d7"])
          ])
        ]),
        h("div.to-row", [
          h("label.label-to", ["To:"]),
          h("input.to", {type: "text", placeholder: "xID name (e.g. bob)", name: "to_value", value: this.to_value, oninput: this.handleToInput, onblur: this.handleToBlur}),
          to_status
        ]),
        h("input.subject", {type: "text", placeholder: "Subject", name: "subject", value: this.subject, oninput: this.handleInput}),
        h("textarea.body", {placeholder: "Message", name: "body", value: this.body, oninput: this.handleInput}),
        h("a.button.button-submit.button-send", {href: "#Send", classes: {"disabled": !this.isFilled(), "loading": this.sending || this.just_sent}, onclick: this.handleSendClick}, ["Encrypt & Send message"])
      ]);
    }

    onSiteInfo(site_info) {
      // placeholder for future use
    }
  }

  Object.assign(MessageCreate.prototype, LogMixin);
  window.MessageCreate = MessageCreate;

})();
