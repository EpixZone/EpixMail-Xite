(function() {
  var EpixFrame = window.EpixFrame;

  window.h = maquette.h;

  class EpixMail extends EpixFrame {
    init() {
      this.params = {};
      this.site_info = null;
      this.server_info = null;
      this.view = "list";
      this.last_folder_url = "Inbox";
      this.xid_profiles = {};
      this.on_site_info = new Deferred();
      this.on_local_storage = new Deferred();
      this.local_storage = null;
      this.notif_total = 0;          // cached SUM(my_seq), refreshed each assemble
      this._last_notif_baseline = null;
      this._web_notif_targets = {};  // web-notification id -> conv_id (for click)
      this._web_notif_seq = 0;
      this._notif_armed = false;     // gate pop-ups until the mailbox has primed
      this._notif_arm_timer = null;
      this.user = new User();
      this.thread_store = new ThreadStore();
      this.reloadThreadsNoanim = this.reloadThreadsNoanim.bind(this);
      this.handleLinkClick = this.handleLinkClick.bind(this);
      this.navigate = this.navigate.bind(this);
      this.renderContent = this.renderContent.bind(this);
      this.returnFalse = this.returnFalse.bind(this);
      this.renderXidAvatar = this.renderXidAvatar.bind(this);
    }

    createProjector() {
      this.projector = maquette.createProjector();
      this.message_create = new MessageCreate();
      this.message_lists = new MessageLists();
      this.message_thread = new MessageThread();
      this.contacts_page = new ContactsPage();
      this.settings_page = new SettingsPage();
      this.shell = new Shell();
      var start_url = base.href.indexOf("?") === -1 ? "" : base.href.replace(/.*?\?/, "");
      this.route(start_url);
      this.history_state["url"] = start_url;
      // Seed the initial history entry with our state, so a browser Back that
      // lands on it carries a url (onpopstate's e.state is null otherwise).
      this.cmd("wrapperReplaceState", [this.history_state, "", start_url ? "?" + start_url : ""]);
      this.projector.replace($("#Shell"), this.shell.render);
      this.projector.replace($("#Content"), this.renderContent);

      setInterval(function() {
        Page.projector.scheduleRender();
      }, 60 * 1000);
    }

    // The start screen owns the main column until the visitor has an xID
    // identity and published mail keys
    needStartScreen() {
      if (!this.site_info) return true;
      if (!this.site_info.cert_user_id) return true;
      if (!this.user.inited) return true;
      if (!this.user.publickey) return true;
      return false;
    }

    renderContent() {
      if (!this.site_info) {
        return h("div#Content");
      }
      var body;
      if (this.needStartScreen()) {
        body = start_screen.render();
      } else if (this.view === "thread") {
        body = this.message_thread.render();
      } else if (this.view === "contacts") {
        body = this.contacts_page.render();
      } else if (this.view === "settings") {
        body = this.settings_page.render();
      } else {
        body = this.message_lists.render();
      }
      return h("div#Content", [body]);
    }

    route(query) {
      this.params = Text.parseQuery(query);
      if (!this.params.urls) {
        this.params.urls = [""];
      }
      this.log("Route", this.params);
      // Deep link (?to=name): open the composer prefilled, then drop the
      // param from the URL so a refresh doesn't reopen it. This is the
      // contract EpixPost's profile Message button uses.
      if (this.params.to) {
        var to = this.params.to;
        this.on_site_info.then(() => {
          this.message_create.show(to);
        });
        this.cmd("wrapperReplaceState", [{}, "", this.createUrl("to", "")]);
        delete this.params.to;
      }
      var page = this.params.urls[0];
      var folders = {
        "": "inbox", "Inbox": "inbox", "Main": "inbox",
        "Starred": "starred", "Archived": "archived",
        "Junk": "junk", "Sent": "sent"
      };
      if (page === "Thread" && this.params.urls[1]) {
        this.view = "thread";
        this.message_thread.setConvId(this.params.urls[1]);
      } else if (page === "Contacts") {
        this.view = "contacts";
        this.contacts_page.update();
      } else if (page === "Settings") {
        this.view = "settings";
        this.settings_page.update();
      } else {
        this.view = "list";
        var folder = folders[page] || "inbox";
        this.last_folder_url = page && folders[page] ? page : "Inbox";
        this.message_lists.setActive(folder);
      }
      this.projector.scheduleRender();
    }

    setUrl(url, mode) {
      if (mode == null) mode = "push";
      url = url.replace(/.*?\?/, "");
      if (this.history_state["url"] === url) {
        this.route(url);
        return false;
      }
      this.history_state["url"] = url;
      if (mode === "replace") {
        this.cmd("wrapperReplaceState", [this.history_state, "", url]);
      } else {
        this.cmd("wrapperPushState", [this.history_state, "", url]);
      }
      this.route(url);
      return false;
    }

    navigate(url) {
      window.scroll(window.pageXOffset, 0);
      this.setUrl(url);
      return false;
    }

    handleLinkClick(e) {
      if (e.which === 2) {
        return true;
      }
      return this.navigate(e.currentTarget.search);
    }

    returnFalse() {
      return false;
    }

    createUrl(key, val) {
      var params = JSON.parse(JSON.stringify(this.params));
      if (typeof key === "object") {
        for (var k in key) {
          params[k] = key[k];
        }
      } else {
        params[key] = val;
      }
      return "?" + Text.encodeQuery(params);
    }

    // Resolve xID chain profiles (avatar, bio) for dotted names; cached
    resolveXidProfiles(names, cb) {
      var missing = [];
      var seen = {};
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (name && !this.xid_profiles[name] && !seen[name]) {
          seen[name] = true;
          missing.push(name);
        }
      }
      if (missing.length === 0) {
        if (cb) cb();
        return;
      }
      this.cmd("xidResolveBatch", [missing], (results) => {
        if (results && !results.error) {
          for (var name in results) {
            this.xid_profiles[name] = results[name] || {};
          }
        } else {
          // Mark as attempted so we don't re-query every render
          for (var mi = 0; mi < missing.length; mi++) {
            this.xid_profiles[missing[mi]] = {};
          }
        }
        if (cb) cb();
      });
    }

    // Shared avatar: the xID chain avatar when known, else a flat letter
    // avatar colored from the name. Always the same selector (span.avatar,
    // keyed by xid) so when a chain avatar resolves and the node flips from
    // letter to image, maquette diffs it in place instead of throwing a
    // distinguishability error on unkeyed same-selector siblings (the
    // stacked group-row avatars) and freezing the projector.
    renderXidAvatar(xid) {
      var profile = this.xid_profiles[xid];
      var avatar = profile && profile.avatar;
      if (avatar) {
        return h("span.avatar", {
          key: xid || "?",
          classes: {letter: false},
          style: "background-image: url('" + avatar + "')"
        });
      }
      var name = xid ? xid.replace(/\.[^.]+$/, "") : "?";
      return h("span.avatar", {
        key: xid || "?",
        classes: {letter: true},
        style: "background-color: " + Text.toColor(xid || "")
      }, (name.charAt(0) || "?").toUpperCase());
    }

    getLocalStorage() {
      this.on_site_info.then(() => {
        this.cmd("userGetSettings", [], (settings) => {
          settings = settings || {};
          var mail = settings.mail || {};
          this.local_storage = mail;
          if (!this.local_storage.read) this.local_storage.read = {};
          if (!this.local_storage.deleted) this.local_storage.deleted = [];
          if (!this.local_storage.parsed) this.local_storage.parsed = {};

          if (!this.local_storage.parsed.version || this.local_storage.parsed.version < 2) {
            // Migrate from browser localStorage on first load (v1 -> v2)
            this.cmd("wrapperGetLocalStorage", [], (old_storage) => {
              if (old_storage && old_storage.read && Object.keys(old_storage.read).length > 0) {
                this.log("Migrating read state from localStorage to userSettings...");
                this.local_storage.read = old_storage.read;
                if (old_storage.deleted) this.local_storage.deleted = old_storage.deleted;
                this.cmd("wrapperSetLocalStorage", {});
              }
              this.migrate(true);
              this.on_local_storage.resolve(this.local_storage);
            });
            return;
          }
          this.migrate(this.local_storage.parsed.version < 4);
          this.on_local_storage.resolve(this.local_storage);
        });
      });
    }

    // v3 added folder state (archived/starred/junk_senders); v4 adds the
    // notification preferences. Seeding is idempotent, so this runs safely
    // from any older version.
    migrate(save) {
      if (!this.local_storage.archived) this.local_storage.archived = {};
      if (!this.local_storage.starred) this.local_storage.starred = {};
      if (!this.local_storage.junk_senders) this.local_storage.junk_senders = [];
      if (this.local_storage.notifications === undefined) this.local_storage.notifications = true;
      if (this.local_storage.desktop_notifications === undefined) this.local_storage.desktop_notifications = true;
      if (this.local_storage.parsed.version !== 4) {
        this.local_storage.parsed = {"version": 4};
        save = true;
      }
      if (save) this.saveLocalStorage();
    }

    // The node computes the dashboard/nav/tray count as SUM(my_seq) - baseline.
    // Keeping baseline = total - unread makes that count equal the in-app
    // unread thread count. When notifications are muted, baseline = total so
    // the external count stays 0 (the in-app Inbox badge is unaffected).
    notifBaseline() {
      var total = this.notif_total || 0;
      if (!this.local_storage || this.local_storage.notifications === false) return total;
      var unread = (this.thread_store && this.thread_store.loaded) ? this.thread_store.unreadCount() : 0;
      return Math.max(0, total - unread);
    }

    saveLocalStorage(cb) {
      if (this.local_storage) {
        this.cmd("userGetSettings", [], (settings) => {
          settings = settings || {};
          settings.mail = this.local_storage;
          if (!settings.notification_seen) settings.notification_seen = {};
          var baseline = this.notifBaseline();
          settings.notification_seen.new_conversations = baseline;
          this.cmd("userSetSettings", [settings], (res) => {
            // Only advance the guard once the write actually landed, so a
            // dropped write doesn't make syncNotifBaseline skip the retry.
            if (!res || !res.error) this._last_notif_baseline = baseline;
            if (cb) cb(res);
          });
        });
      } else if (cb) {
        cb();
      }
    }

    onOpenWebsocket(e) {
      this.cmd("wrapperSetViewport", "width=device-width, initial-scale=1");
      this.cmd("siteInfo", {}, (site_info) => {
        this.setSiteInfo(site_info);
        this.registerFeedFollows();
        this.registerNotifications();
      });
      this.cmd("serverInfo", {}, (server_info) => {
        this.setServerInfo(server_info);
        var lang = server_info && (server_info.language || (server_info.user_settings && server_info.user_settings.language));
        loadLanguage(lang, () => {
          this.projector.scheduleRender();
        });
      });
    }

    // Inbound messages that include me: a signed-CRDT message record encrypted
    // to me (its ct dict, stored as JSON text, has my xid dir as a key), from a
    // peer's file (not my own). Same quoted-LIKE trick as the old members test.
    getConversationPredicate(my_xid_dir) {
      return "message.ct LIKE '%\"" + my_xid_dir + "\"%' AND json.directory != '" + my_xid_dir + "'";
    }

    registerFeedFollows() {
      var my_xid_dir = (Page.site_info && Page.site_info.xid_directory) || "";
      if (!my_xid_dir) return;
      // established rides the first record of a conversation; MAX per peer dir
      // picks it out (later replies leave the column NULL).
      var feeds = {
        "New conversations": [
          "SELECT 'message' AS type, MAX(message.established) AS date_added, 'Encrypted conversation' AS title, 'New conversation with ' || json.directory AS body, '' AS url FROM message LEFT JOIN json USING (json_id) WHERE message.established > 0 AND " + this.getConversationPredicate(my_xid_dir) + " GROUP BY json.directory",
          [""]
        ]
      };
      this.cmd("feedFollow", [feeds]);
    }

    registerNotifications() {
      var my_xid_dir = (Page.site_info && Page.site_info.xid_directory) || "";
      if (!my_xid_dir) return;
      // my_seq is now derived from the folded records: a peer's per-conversation
      // sent count is MAX(seq) over their records for that conversation, summed
      // across every peer conversation that names me.
      var notifications = {
        "new_conversations": [
          "SELECT SUM(mx) AS count FROM (SELECT MAX(message.seq) AS mx FROM message LEFT JOIN json USING (json_id) WHERE " + this.getConversationPredicate(my_xid_dir) + " GROUP BY json.directory, message.conv_id)",
          []
        ]
      };
      this.cmd("notificationSubscribe", [notifications]);
    }

    // Refresh the cached inbound total (SUM over peer conversations of that
    // peer's MAX(seq)), which only changes when mail arrives. Kept identical to
    // the notification subscription so baseline math stays consistent.
    refreshNotifTotal(cb) {
      var my_xid_dir = (Page.site_info && Page.site_info.xid_directory) || "";
      if (!my_xid_dir) { if (cb) cb(); return; }
      var query = "SELECT SUM(mx) AS total FROM (SELECT MAX(message.seq) AS mx FROM message LEFT JOIN json USING (json_id) WHERE " + this.getConversationPredicate(my_xid_dir) + " GROUP BY json.directory, message.conv_id)";
      this.cmd("dbQuery", [query], (rows) => {
        this.notif_total = (rows && rows[0] && rows[0].total) || 0;
        if (cb) cb();
      });
    }

    // Persist the baseline only when it actually changed, so background loads
    // that add nothing don't churn the settings file.
    syncNotifBaseline() {
      if (this.notifBaseline() !== this._last_notif_baseline) this.saveLocalStorage();
    }

    // Called after every thread assembly. Keeps the external count correct and
    // fires an OS/browser notification for mail that arrived since last pass.
    // The first pass primes the high-water mark; pop-ups stay disarmed for a
    // few seconds after so a fresh device syncing an existing mailbox does not
    // pop notifications for the backfill (this replaces a sender-timestamp
    // recency window, which mis-fired under peer clock skew).
    onThreadsAssembled(new_inbound, was_loaded) {
      this.refreshNotifTotal(() => this.syncNotifBaseline());
      if (!this._notif_armed && !this._notif_arm_timer) {
        this._notif_arm_timer = setTimeout(() => {
          this._notif_armed = true;
          this._notif_arm_timer = null;
        }, 8000);
      }
      if (this._notif_armed && new_inbound && new_inbound.length) this.notifyNewMail(new_inbound);
    }

    notifyNewMail(new_inbound) {
      if (!this.local_storage || this.local_storage.notifications === false) return;
      if (this.local_storage.desktop_notifications === false) return;
      var store = this.thread_store;
      // Inbox mail only: skip junk and archived conversations.
      var fresh = new_inbound.filter(function(m) {
        var thread = store.getThread(m.conv_id);
        return thread && thread.folder === "inbox";
      });
      if (!fresh.length) return;
      var latest = fresh[fresh.length - 1];
      var sender = latest.from_xid ? latest.from_xid.replace(/\.[^.]+$/, "") : _("Someone");
      var title, body;
      if (fresh.length === 1) {
        title = _("New message from") + " " + sender;
        body = latest.subject || (latest.body || "").replace(/\s+/g, " ").substring(0, 120);
      } else {
        title = String(fresh.length) + " " + _("new messages");
        body = _("Latest from") + " " + sender;
      }
      this.fireWebNotification(title, body, latest.conv_id);
    }

    // Ask the wrapper to show a real OS/browser notification. The wrapper
    // handles the permission prompt itself and posts webNotificationClick back.
    fireWebNotification(title, body, conv_id) {
      this._web_notif_seq += 1;
      var id = "mail-" + this._web_notif_seq;
      this._web_notif_targets[id] = conv_id || null;
      this.cmd("wrapperWebNotification", [title, id, {body: body, focus_tab: true}]);
    }

    onRequest(cmd, message) {
      var params = message.params;
      if (cmd === "setSiteInfo") {
        this.setSiteInfo(params);
      } else if (cmd === "wrapperPopState") {
        // The very first history entry can have a null state; fall back to the
        // href so Back to it still routes instead of doing nothing.
        var url = (params.state && params.state.url) ||
          (params.href && params.href.indexOf("?") !== -1 ? params.href.replace(/.*\?/, "") : "");
        this.history_state["url"] = url;
        this.route(url);
      } else if (cmd === "webNotificationClick") {
        // Clicking an OS/browser notification jumps to its conversation
        var id = message.params && message.params.id;
        var conv_id = id && this._web_notif_targets[id];
        if (conv_id) {
          delete this._web_notif_targets[id];
          this.navigate("?Thread/" + conv_id);
        }
      } else {
        this.log("Unknown command", cmd);
      }
    }

    // Stable callback for RateLimit (it dedupes on function identity)
    reloadThreadsNoanim() {
      this.thread_store.invalidate();
      this.thread_store.load("noanim");
    }

    setSiteInfo(site_info) {
      this.site_info = site_info;

      if (site_info.event && site_info.event[0] === "cert_changed") {
        this.getLocalStorage();
        this.user.onSiteInfo(site_info);
        this.thread_store.reset();
        // New identity: drop the previous account's cached notification state so
        // a save before the first assemble can't persist a stale baseline, and
        // re-arm the pop-up priming delay.
        this.notif_total = 0;
        this._last_notif_baseline = null;
        this._notif_armed = false;
        if (this._notif_arm_timer) { clearTimeout(this._notif_arm_timer); this._notif_arm_timer = null; }
        // The feed/notification queries key off xid_directory, which was empty
        // before an identity was chosen: (re-)register them now.
        this.registerFeedFollows();
        this.registerNotifications();
        if (site_info.cert_user_id) {
          this.user.loaded.then(() => {
            this.thread_store.load();
          });
        }
      } else if (site_info.event && site_info.event[0] === "file_done") {
        var file_name = site_info.event[1];
        this.user.onSiteInfo(site_info);
        if (file_name.endsWith("/data.json") || file_name.endsWith("/messages.json")) {
          // A mailbox file arrived (mine from another device, or a peer's) -
          // either the signed-CRDT messages.json or a legacy data.json:
          // refresh the threads, background-sync style. The node never
          // echoes this event for our own writes on this connection.
          RateLimit(site_info.bad_files > 0 ? 2000 : 500, this.reloadThreadsNoanim);
        }
      } else {
        this.user.onSiteInfo(site_info);
      }

      this.projector.scheduleRender();
      this.getLocalStorage();
      this.on_site_info.resolve();

      if (site_info.cert_user_id && !site_info.event) {
        this.user.loaded.then(() => {
          this.thread_store.load();
        });
      }
    }

    setServerInfo(server_info) {
      this.server_info = server_info;
      this.projector.scheduleRender();
    }
  }

  window.Page = new EpixMail();
  window.Page.createProjector();

})();
