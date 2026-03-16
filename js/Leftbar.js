(function() {

  class Leftbar {
    constructor() {
      this.contacts = [];
      this.folder_active = "inbox";
      this.reload_contacts = true;
      this.handleContactClick = this.handleContactClick.bind(this);
      this.handleNewMessageClick = this.handleNewMessageClick.bind(this);
      this.handleFolderClick = this.handleFolderClick.bind(this);
      this.handleLogoutClick = this.handleLogoutClick.bind(this);
    }

    handleContactClick(e) {
      Page.message_create.show(e.currentTarget.querySelector(".name").textContent);
      return false;
    }

    handleNewMessageClick(e) {
      Page.message_create.show();
      return false;
    }

    handleFolderClick(e) {
      var folder_name = e.currentTarget.href.replace(/.*\?/, "");
      this.folder_active = folder_name.toLowerCase();
      Page.message_lists.setActive(this.folder_active);
      Page.cmd("wrapperReplaceState", [{}, "", folder_name]);
      return false;
    }

    handleLogoutClick(e) {
      Page.cmd("certXid", [], function() {});
      Page.local_storage = {};
      Page.saveLocalStorage(function() {
        Page.getLocalStorage();
      });
      return false;
    }

    loadContacts(cb) {
      if (!Page.user.data || !Page.user.data.conversations) return cb([]);
      var contacts = {};
      for (var conv_id in Page.user.data.conversations) {
        var conv = Page.user.data.conversations[conv_id];
        if (conv.peer_xid) {
          var name = conv.peer_xid.replace(/\.epix$/i, "");
          contacts[name] = name;
        }
      }
      var result = [];
      for (var xid in contacts) {
        result.push([xid, xid]);
      }
      cb(result);
    }

    getContacts() {
      if (this.reload_contacts) {
        this.reload_contacts = false;
        this.log("Reloading contacts");
        Page.user.loaded.then(() => {
          this.loadContacts((contacts) => {
            contacts = contacts.sort();
            this.contacts = contacts;
            Page.projector.scheduleRender();
          });
        });
      }
      return this.contacts;
    }

    render() {
      var has_cert = (Page.site_info && Page.site_info.cert_user_id) || this.contacts.length > 0;
      var contacts = has_cert ? this.getContacts() : [];
      return h("div.Leftbar", [
        h("a.logo", {href: "?Main"}, ["Epix Mail"]),
        h("a.button-create.newmessage", {href: "#New+message", onclick: this.handleNewMessageClick}, ["New message"]),
        h("div.folders", [
          h("a", {key: "Inbox", href: "?Inbox", classes: {"active": Page.message_lists.active === Page.message_lists.inbox}, onclick: this.handleFolderClick}, ["Inbox"]),
          h("a", {key: "Sent", href: "?Sent", classes: {"active": Page.message_lists.active === Page.message_lists.sent}, onclick: this.handleFolderClick}, [
            "Sent",
            h("span.quota", Page.user.formatQuota())
          ])
        ]),
        contacts.length > 0 ? [
          h("h2", ["Contacts"]),
          h("div.contacts-wrapper", [
            h("div.contacts", contacts.map((entry) => {
              var xid_name = entry[0];
              var color = Text.toColor(xid_name);
              return h("a.username", {key: xid_name, href: Page.createUrl("to", xid_name), onclick: this.handleContactClick, "enterAnimation": Animation.show}, [
                h("span.bullet", {"style": "color: " + color}, ["\u2022"]),
                h("span.name", [xid_name])
              ]);
            }))
          ])
        ] : null,
        (Page.site_info && Page.site_info.cert_user_id) ? h("a.logout.icon.icon-logout", {href: "?Logout", title: "Logout", onclick: this.handleLogoutClick}) : null
      ]);
    }

    onSiteInfo(site_info) {
      if (site_info.event) {
        var action = site_info.event[0];
        var inner_path = site_info.event[1];
        if (action === "file_done" && inner_path.endsWith("data.json")) {
          this.reload_contacts = true;
        }
      }
    }
  }

  Object.assign(Leftbar.prototype, LogMixin);
  window.Leftbar = Leftbar;

})();
