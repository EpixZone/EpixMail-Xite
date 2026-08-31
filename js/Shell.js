(function() {

  // App chrome: desktop rail, mobile top bar + bottom nav + compose FAB,
  // the account block and the compose modal. Mirrors EpixPost's Shell.
  class Shell {
    constructor() {
      this.handleComposeClick = this.handleComposeClick.bind(this);
      this.handleAccountRailClick = this.handleAccountRailClick.bind(this);
      this.handleAccountTopClick = this.handleAccountTopClick.bind(this);
      this.handleSettingsClick = this.handleSettingsClick.bind(this);
      this.handleFolderMenuClick = this.handleFolderMenuClick.bind(this);
      this.handleBackClick = this.handleBackClick.bind(this);
      this.renderNavItem = this.renderNavItem.bind(this);
      this.render = this.render.bind(this);
      this.menu_account_rail = new Menu();
      this.menu_account_top = new Menu();
      this.menu_folder = new Menu();
    }

    handleComposeClick() {
      if (!Page.site_info || !Page.site_info.cert_user_id || !Page.user.publickey) {
        Page.cmd("wrapperNotification", ["info", _("Choose your xID and generate your keys first")]);
        return false;
      }
      Page.message_create.show();
      return false;
    }

    handleSelectUserClick() {
      Page.cmd("certXid", []);
      return false;
    }

    handleSettingsClick() {
      Page.navigate("?Settings");
      return false;
    }

    buildAccountMenu(menu) {
      menu.items = [];
      if (Page.site_info && Page.site_info.cert_user_id) {
        menu.items.push([_("Settings"), this.handleSettingsClick]);
        menu.items.push([_("Switch account"), this.handleSelectUserClick]);
      } else {
        menu.items.push([_("Select account"), this.handleSelectUserClick]);
      }
    }

    handleAccountRailClick() {
      this.buildAccountMenu(this.menu_account_rail);
      this.menu_account_rail.toggle();
      return false;
    }

    handleAccountTopClick() {
      this.buildAccountMenu(this.menu_account_top);
      this.menu_account_top.toggle();
      return false;
    }

    // Mobile: the top bar title doubles as a folder switcher, so Archived
    // and Junk stay reachable without a 6-slot bottom nav
    handleFolderMenuClick() {
      var menu = this.menu_folder;
      menu.items = [];
      var items = this.getNavItems(true);
      for (var i = 0; i < items.length; i++) {
        (function(item) {
          menu.addItem(item.title, function() {
            Page.navigate(item.href);
            return false;
          }, Page.shell.isActive(item.id));
        })(items[i]);
      }
      menu.toggle();
      return false;
    }

    handleBackClick() {
      Page.navigate("?" + (Page.last_folder_url || "Inbox"));
      return false;
    }

    isActive(id) {
      if (Page.view === "contacts") return id === "contacts";
      if (Page.view === "thread" || Page.view === "settings") return false;
      return Page.message_lists.active === Page.message_lists[id];
    }

    getNavItems(full) {
      var items = [
        {id: "inbox", title: _("Inbox"), href: "?Inbox", icon: "icon-inbox", badge: Page.thread_store.unreadCount()},
        {id: "starred", title: _("Starred"), href: "?Starred", icon: "icon-star"}
      ];
      if (full) {
        items.push({id: "archived", title: _("Archived"), href: "?Archived", icon: "icon-archive"});
        items.push({id: "junk", title: _("Junk"), href: "?Junk", icon: "icon-junk"});
      }
      items.push({id: "sent", title: _("Sent"), href: "?Sent", icon: "icon-sent"});
      items.push({id: "contacts", title: _("Contacts"), href: "?Contacts", icon: "icon-users"});
      return items;
    }

    renderNavItem(item) {
      return h("a.nav-item", {
        key: item.id,
        href: item.href,
        title: item.title,
        onclick: Page.handleLinkClick,
        classes: {active: this.isActive(item.id)}
      }, [
        h("span.icon." + item.icon),
        h("span.nav-label", item.title),
        item.badge ? h("span.badge", String(item.badge)) : null
      ]);
    }

    getTitle() {
      if (Page.view === "thread") return _("Conversation");
      if (Page.view === "contacts") return _("Contacts");
      if (Page.view === "settings") return _("Settings");
      return _(Page.message_lists.active.title);
    }

    renderRailAccount() {
      var name, detail;
      if (!Page.site_info) return h("div.rail-account.empty");
      if (Page.site_info.cert_user_id) {
        name = Page.site_info.cert_user_id.replace(/@.*$/, "");
        detail = Page.user.formatQuota() || Page.site_info.cert_user_id;
      } else {
        name = _("Visitor");
        detail = _("Select your account");
      }
      var xid = Crypto.normalizeXid(Page.user.getMyXid());
      return h("div.rail-account-wrap", [
        h("a.rail-account", {
          href: "#Account",
          title: name,
          onclick: Page.returnFalse,
          onmousedown: this.handleAccountRailClick
        }, [
          xid ? Page.renderXidAvatar(xid) : h("span.avatar.letter", "?"),
          h("div.rail-account-info", [
            h("span.name", name),
            h("span.address", detail)
          ])
        ]),
        this.menu_account_rail.render(".menu-account")
      ]);
    }

    // Honest delivery state instead of a publish popup: the node accepts a
    // send into a durable queue and delivers when peers are reachable; this
    // line is visible exactly while that queue is non-empty.
    renderOutboxNote() {
      var s = Page.user.session;
      if (!s || !s.outbox_pending) return null;
      var text = s.outbox_pending === 1
        ? _("1 message queued for delivery")
        : s.outbox_pending + " " + _("messages queued for delivery");
      return h("div.rail-outbox-note", {
        title: s.outbox_error || _("Will deliver as soon as a peer is reachable")
      }, [text]);
    }

    renderRail() {
      return h("div.rail", [
        h("a.rail-logo", {href: "?Inbox", onclick: Page.handleLinkClick}, [
          h("img", {src: "img/logo.svg", alt: ""}),
          h("span.logo-text", _("Epix Mail"))
        ]),
        h("a.button.button-submit.rail-compose", {
          href: "#Compose",
          title: _("New message"),
          onclick: this.handleComposeClick
        }, [
          h("span.icon.icon-compose"),
          h("span.rail-compose-label", _("Compose"))
        ]),
        this.renderOutboxNote(),
        h("nav.rail-nav", this.getNavItems(true).map(this.renderNavItem)),
        h("div.rail-spacer"),
        this.renderRailAccount()
      ]);
    }

    renderTopbar() {
      var xid = Crypto.normalizeXid(Page.user.getMyXid());
      return h("div.topbar", [
        Page.view === "thread"
          ? h("a.icon.icon-back.topbar-back", {href: "#Back", title: _("Back"), onclick: this.handleBackClick})
          : h("a.topbar-logo", {href: "?Inbox", onclick: Page.handleLinkClick},
              h("img", {src: "img/logo.svg", alt: "Epix Mail"})),
        h("div.topbar-title-wrap", [
          h("a.topbar-title", {
            href: "#Folders",
            onclick: Page.returnFalse,
            onmousedown: this.handleFolderMenuClick
          }, [
            this.getTitle(),
            h("span.caret", " ▾")
          ]),
          this.menu_folder.render(".menu-topbar-title")
        ]),
        h("div.topbar-account", [
          h("a.topbar-avatar", {
            href: "#Account",
            title: _("Account"),
            onclick: Page.returnFalse,
            onmousedown: this.handleAccountTopClick
          }, [xid ? Page.renderXidAvatar(xid) : h("span.avatar.letter", "?")]),
          this.menu_account_top.render(".menu-topbar")
        ])
      ]);
    }

    render() {
      return h("div#Shell", [
        this.renderRail(),
        this.renderTopbar(),
        h("nav.bottomnav", this.getNavItems(false).map(this.renderNavItem)),
        h("a.fab", {
          href: "#Compose",
          title: _("New message"),
          onclick: this.handleComposeClick
        }, h("span.icon.icon-compose")),
        Page.message_create.render()
      ]);
    }
  }

  Object.assign(Shell.prototype, LogMixin);
  window.Shell = Shell;

})();
