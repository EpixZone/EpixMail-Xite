(function() {
  var EpixFrame = window.EpixFrame;

  window.h = maquette.h;

  class EpixMail extends EpixFrame {
    init() {
      this.params = {};
      this.site_info = null;
      this.on_site_info = new Deferred();
      this.on_local_storage = new Deferred();
      this.server_info = null;
      this.user = new User();
      this.users = new Users();
      this.local_storage = null;
    }

    createProjector() {
      this.leftbar = new Leftbar();
      this.message_lists = new MessageLists();
      this.message_show = new MessageShow();
      this.message_create = new MessageCreate();
      this.projector = maquette.createProjector();
      if (base.href.indexOf("?") === -1) {
        this.route("");
      } else {
        this.route(base.href.replace(/.*?\?/, ""));
      }
      this.projector.replace($("#MessageLists"), this.message_lists.render.bind(this.message_lists));
      this.projector.replace($("#MessageShow"), this.message_show.render.bind(this.message_show));
      this.projector.replace($("#Leftbar"), this.leftbar.render.bind(this.leftbar));
      this.projector.merge($("#MessageCreate"), this.message_create.render.bind(this.message_create));

      setInterval(function() {
        Page.projector.scheduleRender();
      }, 60 * 1000);
    }

    route(query) {
      this.params = Text.parseQuery(query);
      this.log("Route", this.params);
      if (this.params.to) {
        this.on_site_info.then(() => {
          this.message_create.show(this.params.to);
        });
        this.cmd("wrapperReplaceState", [{}, "", this.createUrl("to", "")]);
      }
      if (this.params.url === "Sent") {
        this.message_lists.setActive("sent");
      }
    }

    createUrl(key, val) {
      var params = JSON.parse(JSON.stringify(this.params));
      if (typeof key === "Object") {
        var vals = key;
        for (var k in vals) {
          params[k] = vals[k];
        }
      } else {
        params[key] = val;
      }
      return "?" + Text.encodeQuery(params);
    }

    getLocalStorage() {
      this.on_site_info.then(() => {
        this.cmd("wrapperGetLocalStorage", [], (local_storage) => {
          this.local_storage = local_storage || {};
          if (!this.local_storage.read) this.local_storage.read = {};
          if (!this.local_storage.deleted) this.local_storage.deleted = [];
          if (!this.local_storage.parsed) this.local_storage.parsed = {};

          if (!this.local_storage.parsed.version || this.local_storage.parsed.version < 2) {
            this.local_storage.parsed = {"version": 2};
            console.log("Reindexing for v2...");
          }

          this.on_local_storage.resolve(this.local_storage);
        });
      });
    }

    saveLocalStorage(cb) {
      if (this.local_storage) {
        this.cmd("wrapperSetLocalStorage", this.local_storage, function(res) {
          if (cb) cb(res);
        });
      }
    }

    onOpenWebsocket(e) {
      this.cmd("siteInfo", {}, (site_info) => {
        this.setSiteInfo(site_info);
        this.registerFeedFollows();
      });
      this.cmd("serverInfo", {}, (server_info) => {
        this.setServerInfo(server_info);
      });
    }

    registerFeedFollows() {
      var my_xid_dir = (Page.site_info && Page.site_info.xid_directory) || "";
      if (!my_xid_dir) return;
      var feeds = {
        "New conversations": [
          "SELECT 'message' AS type, MAX(conversation.established) AS date_added, 'Encrypted conversation' AS title, 'New conversation with ' || REPLACE(json.directory, 'data/users/', '') AS body, '' AS url FROM conversation LEFT JOIN json USING (json_id) WHERE conversation.established > 0 AND conversation.peer_xid = '" + my_xid_dir + "' AND json.directory != 'data/users/" + my_xid_dir + "' GROUP BY json.directory",
          [""]
        ]
      };
      this.cmd("feedFollow", [feeds]);
    }

    onRequest(cmd, message) {
      if (cmd === "setSiteInfo") {
        this.setSiteInfo(message.params);
      } else {
        this.log("Unknown command", cmd);
      }
    }

    setSiteInfo(site_info) {
      this.site_info = site_info;

      if (site_info.event && site_info.event[0] === "cert_changed") {
        this.getLocalStorage();
        this.user.onSiteInfo(site_info);
        this.message_lists.onSiteInfo(site_info);
      }

      var limit_interval;
      if (site_info.tasks > 20) {
        limit_interval = 60000;
      } else {
        limit_interval = 6000;
      }
      RateLimit(limit_interval, () => {
        this.log("onSiteInfo RateLimit");
        this.leftbar.onSiteInfo(site_info);
        this.user.onSiteInfo(site_info);
        this.message_create.onSiteInfo(site_info);
        this.message_lists.onSiteInfo(site_info);
      });

      this.projector.scheduleRender();
      this.getLocalStorage();
      this.on_site_info.resolve();

      if (site_info.cert_user_id && !site_info.event) {
        this.user.loaded.then(() => {
          if (!this.message_lists.inbox.loaded && !this.message_lists.inbox.loading) {
            this.message_lists.inbox.reload = true;
            this.message_lists.inbox.triggerLoad();
          }
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
