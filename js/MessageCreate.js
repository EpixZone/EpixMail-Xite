(function() {

  // Compose modal: To-chips for one or many recipients, subject, body and
  // the signature "Encrypt & Send" scramble effect. A chip is valid when the
  // xID exists - and ONLY that. Whether the person has published mail keys is
  // deliberately NOT surfaced here: doing so would advertise who is and is
  // not on the mail platform, and since enrollment is now explicit (no file
  // is created just by visiting), absence proves nothing anyway. Delivery
  // capability is checked once, at send, where the node gives the honest
  // error if the recipient has no published keys yet.
  class MessageCreate {
    constructor() {
      this.visible = false;
      this.subject = "";
      this.body = "";
      this.sending = false;
      this.just_sent = false;
      this.to_list = [];  // [{name, checking, valid, reason, seq}]
      this._chip_seq = 0;
      this.node = null;
      this.handleCloseClick = this.handleCloseClick.bind(this);
      this.handleScrimClick = this.handleScrimClick.bind(this);
      this.handleInput = this.handleInput.bind(this);
      this.handleSendClick = this.handleSendClick.bind(this);
      this.handleChipRemoveClick = this.handleChipRemoveClick.bind(this);
      this.renderChip = this.renderChip.bind(this);
      this.setNode = this.setNode.bind(this);
      this.autocomplete = new Autocomplete(
        () => this.getContactNames(),
        {placeholder: ""},
        (value) => {
          if (value) this.addRecipient(value);
          this.autocomplete.attrs.value = "";
        }
      );
      // Commit a chip on comma too, and pop the last chip on backspace in an
      // empty field (the autocomplete's own handler keeps Enter/arrows)
      var autocomplete_key = this.autocomplete.handleKey;
      this.autocomplete.attrs.onkeydown = (e) => {
        if (e.key === ",") {
          this.autocomplete.handleBlur(e);
          return false;
        }
        if (e.key === "Backspace" && !e.target.value && this.to_list.length > 0) {
          this.to_list.pop();
          Page.projector.scheduleRender();
          return false;
        }
        return autocomplete_key(e);
      };
    }

    stripTld(name) {
      return name ? name.replace(/\.epix$/i, "") : name;
    }

    withTld(name) {
      return (name && !name.match(/\.epix$/i)) ? name + ".epix" : name;
    }

    setNode(node) {
      this.node = node;
    }

    getContactNames() {
      var names = Page.thread_store.getContacts().map(this.stripTld);
      var used = {};
      for (var i = 0; i < this.to_list.length; i++) {
        used[this.to_list[i].name] = true;
      }
      return names.filter(function(name) {
        return !used[name];
      });
    }

    addRecipient(name) {
      name = this.stripTld((name || "").trim().replace(/,/g, ""));
      if (!name) return;
      for (var i = 0; i < this.to_list.length; i++) {
        if (this.to_list[i].name === name) return;
      }
      var chip = {name: name, checking: true, valid: null, reason: null, seq: ++this._chip_seq};
      this.to_list.push(chip);
      this.validateChip(chip);
      Page.projector.scheduleRender();
    }

    // Valid chip == the xID exists. Nothing else: key-publication status is
    // never surfaced during compose (it would advertise who is on the mail
    // platform). The local bundle read is only a zero-leak fast path that
    // also keeps compose working when the chain resolver is unreachable.
    validateChip(chip) {
      var xid = this.withTld(chip.name);
      var seq = chip.seq;
      // Fast path: a purely local read of the recipient's already-synced key
      // bundle (zero network, no leak of who you're composing to). A bundle
      // proves the xID exists, so no chain call is needed. Without one, a
      // single chain lookup checks the ONE thing a chip validates: that the
      // xID exists. Key-publication status is intentionally not shown.
      Page.channel
        .keyLookup([xid])
        .then((res) => {
          if (this.to_list.indexOf(chip) === -1 || chip.seq !== seq) return;
          var entry = res && res[Crypto.normalizeXid(xid)];
          if (entry && entry.has_bundle) {
            chip.checking = false;
            chip.valid = true;
            chip.reason = null;
            Page.projector.scheduleRender();
            return;
          }
          Page.cmd("xidResolveName", [xid], (result) => {
            if (this.to_list.indexOf(chip) === -1 || chip.seq !== seq) return;
            chip.checking = false;
            if (result && !result.error) {
              chip.valid = true;
              chip.reason = null;
            } else {
              chip.valid = false;
              chip.reason = _("xID not found");
            }
            Page.projector.scheduleRender();
          });
        })
        .catch(() => {
          if (this.to_list.indexOf(chip) === -1 || chip.seq !== seq) return;
          chip.checking = false;
          chip.valid = false;
          Page.projector.scheduleRender();
        });
    }

    handleChipRemoveClick(e) {
      e.stopPropagation();
      var name = e.currentTarget.attributes["data-name"].value;
      this.to_list = this.to_list.filter(function(chip) {
        return chip.name !== name;
      });
      Page.projector.scheduleRender();
      return false;
    }

    isFilled() {
      if (!this.body.trim() || this.to_list.length === 0 || !Page.user.publickey) return false;
      for (var i = 0; i < this.to_list.length; i++) {
        var chip = this.to_list[i];
        if (chip.checking || chip.valid !== true) return false;
      }
      return true;
    }

    getTitle() {
      if (this.just_sent) return _("Message sent!");
      return _("New message");
    }

    show(to, subject, body) {
      if (to) this.addRecipient(to);
      if (subject) this.subject = subject;
      if (body) this.body = body;
      this.visible = true;
      Page.projector.scheduleRender();
      setTimeout(() => {
        if (!this.node) return;
        var input = this.node.querySelector(this.to_list.length === 0 ? ".to-chips input.to" : (!this.subject ? ".subject" : ".body"));
        if (input) input.focus();
      }, 100);
      return false;
    }

    hide() {
      this.visible = false;
      Page.projector.scheduleRender();
    }

    reset() {
      this.to_list = [];
      this.subject = "";
      this.body = "";
      this.autocomplete.attrs.value = "";
      this.just_sent = false;
      this.sending = false;
    }

    handleCloseClick(e) {
      if (e) e.cancelBubble = true;
      this.hide();
      if (this.just_sent) this.reset();
      return false;
    }

    handleScrimClick(e) {
      if (e.target === e.currentTarget) {
        this.hide();
        return false;
      }
      return true;
    }

    handleInput(e) {
      this[e.target.name] = e.target.value;
      return false;
    }

    handleSendClick() {
      if (this.sending || this.just_sent) return false;
      // Commit any half-typed recipient first
      if (this.autocomplete.attrs.value) {
        this.addRecipient(this.autocomplete.attrs.value);
        this.autocomplete.attrs.value = "";
      }
      if (!this.isFilled()) {
        for (var i = 0; i < this.to_list.length; i++) {
          var chip = this.to_list[i];
          if (chip.valid === false) {
            Page.cmd("wrapperNotification", ["error", chip.reason || (_("Can't send to") + " " + chip.name)]);
            return false;
          }
          if (chip.checking) {
            Page.cmd("wrapperNotification", ["info", _("Verifying xID name...")]);
            return false;
          }
        }
        return false;
      }
      // The encrypting effect: everything the user typed scrambles into
      // Braille glyphs while the message is encrypted per recipient
      Animation.scramble(this.node.querySelector(".subject"));
      Animation.scramble(this.node.querySelector(".body"));
      var chips = this.node.querySelectorAll(".chip-name");
      for (var ci = 0; ci < chips.length; ci++) {
        Animation.scrambleText(chips[ci]);
      }
      this.sending = true;
      var recipients = this.to_list.map((chip) => this.withTld(chip.name));
      this.log("Sending encrypted message to", recipients.join(", "));
      Page.user.sendMessage(recipients, this.subject, this.body, null, (res) => {
        this.sending = false;
        if (res) {
          this.just_sent = true;
          Page.thread_store.invalidate();
          Page.thread_store.load("noanim");
          setTimeout(() => {
            this.reset();
            this.hide();
          }, 2500);
        } else {
          // Restore the scrambled fields from state. The scramble mutated the
          // DOM (input values and chip textContent) outside maquette, and the
          // vdom text is unchanged, so maquette won't repair it - restore by
          // hand.
          if (this.node) {
            this.node.querySelector(".subject").value = this.subject;
            this.node.querySelector(".body").value = this.body;
            var chip_els = this.node.querySelectorAll(".chip-name");
            for (var i = 0; i < chip_els.length && i < this.to_list.length; i++) {
              chip_els[i].textContent = this.to_list[i].name;
            }
          }
        }
        Page.projector.scheduleRender();
      });
      return false;
    }

    renderChip(chip) {
      return h("span.chip", {
        key: "chip-" + chip.name,
        title: chip.reason || this.withTld(chip.name),
        classes: {
          checking: chip.checking,
          valid: chip.valid === true,
          invalid: chip.valid === false
        }
      }, [
        h("span.chip-name", chip.name),
        chip.checking ? h("span.spinner") : null,
        chip.valid === false ? h("span.chip-err", _("not found")) : null,
        h("a.chip-x", {
          href: "#Remove",
          "data-name": chip.name,
          onclick: this.handleChipRemoveClick
        }, "×")
      ]);
    }

    render() {
      if (!this.visible) return void 0;
      this.autocomplete.attrs.placeholder = this.to_list.length === 0 ? _("xID name (e.g. bob)") : "";
      return h("div.composer-scrim", {key: "compose", onclick: this.handleScrimClick}, [
        h("div.composer-modal.MessageCreate", {classes: {sent: this.just_sent}, afterCreate: this.setNode}, [
          h("div.composer-head", [
            h("span.composer-title", this.getTitle()),
            h("a.composer-close", {href: "#Close", title: _("Close"), onclick: this.handleCloseClick}, "×")
          ]),
          h("div.to-row", [
            h("label.label-to", _("To:")),
            h("div.to-chips", this.to_list.map(this.renderChip).concat([this.autocomplete.render()]))
          ]),
          h("input.subject", {
            type: "text",
            placeholder: _("Subject"),
            name: "subject",
            // Never feed subjects into the browser's saved form history - a
            // mail app's past subjects must not resurface as an autofill
            // dropdown (or persist in the browser profile at all).
            autocomplete: "off",
            value: this.subject,
            oninput: this.handleInput
          }),
          h("textarea.body", {
            placeholder: _("Message"),
            name: "body",
            autocomplete: "off",
            value: this.body,
            oninput: this.handleInput
          }),
          h("div.composer-foot", [
            h("span.encrypt-note", [
              h("span.icon.icon-lock"),
              _("End-to-end encrypted")
            ]),
            h("a.button.button-submit.button-send", {
              href: "#Send",
              classes: {disabled: !this.isFilled(), loading: this.sending || this.just_sent},
              onclick: this.handleSendClick
            }, _("Encrypt & Send"))
          ])
        ])
      ]);
    }
  }

  Object.assign(MessageCreate.prototype, LogMixin);
  window.MessageCreate = MessageCreate;

})();
