(function() {

  class StartScreen {
    constructor() {
      this.handleCertselect = this.handleCertselect.bind(this);
      this.handleCreate = this.handleCreate.bind(this);
      this.renderBody = this.renderBody.bind(this);
    }

    addDots(s) {
      return ".".repeat(18 - s.length) + s;
    }

    getTermLines() {
      var lines = [];
      var server_info = Page.server_info;
      var site_info = Page.site_info;

      var end_version = server_info.version + " r" + server_info.rev;
      if (server_info.rev > 630) {
        end_version += " [OK]";
      } else {
        end_version += " [FAIL]";
      }

      var end_sync;
      if (site_info.bad_files === 0) {
        end_sync = "[DONE]";
      } else {
        if (site_info.workers > 0) {
          var percent = Math.round(100 - (site_info.bad_files / site_info.started_task_num) * 100);
          end_sync = "[ " + percent + "%]";
        } else {
          end_sync = "[BAD:" + site_info.bad_files + "]";
        }
      }

      lines.push("Checking EpixNet version......................." + this.addDots(end_version));
      lines.push("Syncing encrypted mailboxes...................." + this.addDots(end_sync));
      lines.push("Encryption protocol............................ECIES + ECDSA");
      if (Page.site_info.cert_user_id && !Page.user.inited) {
        lines.push("Checking current user's identity key...........[LOADING]");
      } else {
        lines.push("Checking current user's identity key...........[NOT FOUND]");
      }
      return lines.join("\n");
    }

    handleCertselect() {
      Page.cmd("certXid", [], function(result) {
        Page.log("certXid result", result);
      });
      return false;
    }

    handleCreate() {
      Page.user.createData();
      return false;
    }

    renderBody(node) {
      node.innerHTML = Text.renderMarked(node.textContent, {"sanitize": true});
    }

    renderNocert() {
      this.log("renderNocert");
      return h("div.StartScreen.nocert", {"key": "nocert", "afterCreate": Animation.addVisibleClass, "exitAnimation": Animation.slideUp}, [
        h("div.banner.term", {"afterCreate": Animation.termLines}, ["W E L C O M E   T O \n\n" + $("#banner").textContent + "\n\n\n"]),
        (Page.server_info && Page.site_info)
          ? h("div.term", {"afterCreate": Animation.termLines, "delay": 1, "delay_step": 0.2}, [this.getTermLines()])
          : null,
        (Page.server_info && Page.site_info)
          ? (Page.server_info.rev < 630)
            ? h("a.button.button-submit.button-certselect.disabled", {"href": "#Update", "afterCreate": Animation.show, "delay": 0, "style": "margin-left: -150px"}, ["Please update your EpixNet client!"])
            : (!Page.site_info.cert_user_id)
              ? h("a.button.button-submit.button-certselect", {"key": "certselect", "href": "#Select+username", "afterCreate": Animation.show, "delay": 1, onclick: this.handleCertselect}, ["Connect xID identity"])
              : (Page.user.inited)
                ? [
                    h("div.term", {"key": "username-term", "afterCreate": Animation.termLines}, [
                      "Connected identity: " + Page.site_info.cert_user_id + ".".repeat(Math.max(22 - Page.site_info.cert_user_id.length, 0)) + "...[GENERATING KEYS]"
                    ]),
                    h("a.button.button-submit.button-certselect", {"key": "create", "href": "#Create+data", "afterCreate": Animation.show, "delay": 1, onclick: this.handleCreate}, ["Generate encryption keys"])
                  ]
                : h("div.term", {"key": "loading-term", "afterCreate": Animation.termLines}, [
                    "Connected identity: " + Page.site_info.cert_user_id + ".".repeat(Math.max(22 - Page.site_info.cert_user_id.length, 0)) + "...[LOADING]"
                  ])
          : null
      ]);
    }

    renderNomessage() {
      this.log("renderNomessage");
      return h("div.StartScreen.nomessage", {"key": "nomessage", "enterAnimation": Animation.slideDown}, [
        h("div.subject", ["Encryption keys generated!"]),
        h("div.from", [
          "From: ",
          h("a.username", {"href": "#"}, "epixmail")
        ]),
        h("div.body", {afterCreate: this.renderBody}, [
          "Hello " + (Page.user.getMyXid() || "user") + "!\n\n" +
          "Your end-to-end encryption keys have been generated. All messages you send and receive are encrypted with ECIES and signed with ECDSA for authentication.\n\n" +
          "Anyone with an xID can send you encrypted messages that only you can read.\n\n" +
          "_Best regards: Epix Mail_\n\n" +
          "###### PS: Your encryption keys are derived from your xID identity. Keep your identity safe!"
        ])
      ]);
    }
  }

  Object.assign(StartScreen.prototype, LogMixin);
  window.start_screen = new StartScreen();

})();
