(function() {

  // Compose modal: To-chips for one or many recipients, subject, body and
  // the signature "Encrypt & Send" scramble effect. Every chip is validated
  // twice: the xID must exist on chain (xidResolveName) and the person must
  // have published mail keys (their data.json on this xite).
  class MessageCreate {
    constructor() {
      this.visible = false;
      this.subject = "";
      this.body = "";
      this.sending = false;
      this.just_sent = false;
      this.to_list = [];  // [{name, checking, valid, unreachable, reason, seq}]
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
      // xIDs never contain a space or comma, so either one commits the typed
      // name into a chip - that is how you add several recipients. Backspace in
      // an empty field pops the last chip. (The autocomplete keeps Enter/arrows.)
      var autocomplete_key = this.autocomplete.handleKey;
      this.autocomplete.attrs.onkeydown = (e) => {
        if (e.key === "," || e.key === " ") {
          if (e.target.value.trim()) this.autocomplete.handleBlur(e);
          if (e.preventDefault) e.preventDefault();
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
      var chip = {name: name, checking: true, valid: null, unreachable: false, reason: null, seq: ++this._chip_seq};
      this.to_list.push(chip);
      this.validateChip(chip);
      Page.projector.scheduleRender();
    }

    // A published mail pubkey is the real requirement for sending (and
    // proves the xID exists), so check it first; the chain lookup only runs
    // when there are no keys, to tell a typo apart from someone who just
    // hasn't opened Epix Mail yet. This keeps compose working when the
    // chain resolver is unreachable.
    validateChip(chip) {
      var xid = this.withTld(chip.name);
      var seq = chip.seq;
      Crypto.resolveMemberPubkeys([xid], (pubkeys, missing) => {
        if (this.to_list.indexOf(chip) === -1 || chip.seq !== seq) return;
        if (missing.length === 0) {
          chip.checking = false;
          chip.valid = true;
          chip.unreachable = false;
          chip.reason = null;
          Page.projector.scheduleRender();
          return;
        }
        Page.cmd("xidResolveName", [xid], (result) => {
          if (this.to_list.indexOf(chip) === -1 || chip.seq !== seq) return;
          chip.checking = false;
          if (result && !result.error) {
            // Real xID on chain, but no published mail keys: they exist, they
            // just haven't joined Epix Mail yet.
            chip.valid = true;
            chip.unreachable = true;
            chip.reason = this.withTld(chip.name) + " " + _("hasn't joined Epix Mail yet");
          } else {
            // The name does not resolve on chain at all: not a real xID.
            chip.valid = false;
            chip.unreachable = false;
            chip.reason = _("No registered xID named") + " " + this.withTld(chip.name);
          }
          Page.projector.scheduleRender();
        });
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
        if (chip.checking || chip.valid !== true || chip.unreachable) return false;
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
          if (chip.valid === false || chip.unreachable) {
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

    // A line under the To field: explains why send is blocked when a chip is
    // bad, otherwise reminds that several people can be added.
    renderToHint() {
      var checking = false;
      for (var i = 0; i < this.to_list.length; i++) {
        var chip = this.to_list[i];
        if (chip.checking) { checking = true; continue; }
        if (chip.valid === false) {
          return h("div.to-hint.error", this.withTld(chip.name) + " " + _("is not a registered xID, so it can't receive mail."));
        }
        if (chip.unreachable) {
          return h("div.to-hint.warn", this.withTld(chip.name) + " " + _("hasn't joined Epix Mail yet, so there's no key to encrypt to. They need to open Epix Mail once first."));
        }
      }
      if (checking) return h("div.to-hint", _("Checking xID..."));
      return h("div.to-hint", _("Type an xID and press space to add. You can message several people at once."));
    }

    renderChip(chip) {
      return h("span.chip", {
        key: "chip-" + chip.name,
        title: chip.reason || this.withTld(chip.name),
        classes: {
          checking: chip.checking,
          valid: chip.valid === true && !chip.unreachable,
          invalid: chip.valid === false,
          unreachable: chip.unreachable
        }
      }, [
        h("span.chip-name", chip.name),
        chip.checking ? h("span.spinner") : null,
        chip.valid === false ? h("span.chip-err", _("no such xID")) : null,
        chip.unreachable ? h("span.chip-err", _("not on Epix Mail")) : null,
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
          this.renderToHint(),
          h("input.subject", {
            type: "text",
            placeholder: _("Subject"),
            name: "subject",
            value: this.subject,
            oninput: this.handleInput
          }),
          h("textarea.body", {
            placeholder: _("Message"),
            name: "body",
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
