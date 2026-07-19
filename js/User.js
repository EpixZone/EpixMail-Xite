(function() {

  class User {
    constructor() {
      this.data = null;
      this.publickey = null;
      this.data_size = null;
      this.file_rules = null;
      this.my_xid = null;
      this.my_user_dir = null;
      this.quota_warned = false;
      // True only once this.data reflects a real synced data.json (loaded from
      // disk or just created by this user). Content writes are refused while it
      // is false so a blank/default is never published over an unsynced file.
      this.data_loaded_from_file = false;

      this.loading = false;
      this.inited = false;
      this._load_start = Date.now();
      this.loaded = new Deferred();
      this.loaded.then((res) => {
        this.loading = false;
        this.log("Loaded", res);
        Page.projector.scheduleRender();
      });
    }

    getInnerPath(file_name) {
      if (!file_name) file_name = "data.json";
      var user_dir = this.my_user_dir || Page.site_info.xid_directory || Page.site_info.auth_address;
      return "data/users/" + user_dir + "/" + file_name;
    }

    getMyXid() {
      if (this.my_xid) return this.my_xid;
      var cert = Page.site_info && Page.site_info.cert_user_id;
      if (cert) {
        this.my_xid = cert.replace(/@.*/, "");
        return this.my_xid;
      }
      return null;
    }

    getMyXidDir() {
      return this.my_user_dir || (Page.site_info && (Page.site_info.xid_directory || Page.site_info.auth_address));
    }

    // Get or create conversation. Membership is fixed at creation: a reply
    // into an existing conversation keeps its member list; a new conversation
    // stores the canonical sorted members (always including self).
    // peer_xid is kept for old clients: they see the group as a 1:1 with the
    // first non-self member and can still decrypt their own ct entry.
    getOrCreateConversation(members, conv_id) {
      if (!this.data.conversations) {
        this.data.conversations = {};
      }
      if (this.data.conversations[conv_id]) {
        return this.data.conversations[conv_id];
      }
      var my_xid = Crypto.normalizeXid(this.getMyXid());
      var peer = my_xid;
      for (var i = 0; i < members.length; i++) {
        if (members[i] !== my_xid) {
          peer = members[i];
          break;
        }
      }
      var conv = {
        peer_xid: peer,
        members: members,
        established: Date.now(),
        my_seq: 0,
        messages: {}
      };
      this.data.conversations[conv_id] = conv;
      return conv;
    }

    getSenderPubkeys(cb) {
      var pubkey = this.data && this.data.publickey;
      if (!pubkey) return cb({});
      var my_xid_dir = this.getMyXidDir();
      var result = {};
      result[my_xid_dir] = pubkey;
      cb(result);
    }

    // True byte size of the current data.json as it will be written to disk
    // (fileWrite decodes the base64, so the quota applies to the raw JSON).
    getDataSize() {
      if (!this.data) return 0;
      return Text.utf8Encode(JSON.stringify(this.data, undefined, "\t")).length;
    }

    // Quota guard: warn above 80% of max_size, block above 98%. An oversized
    // file would sign locally but be rejected by every peer ("Content too
    // large"), silently forking the mailbox - better to stop the send here.
    checkSizeBudget() {
      var max_size = this.file_rules && this.file_rules.max_size;
      if (!max_size) return true;
      var size = this.getDataSize();
      if (size > max_size * 0.98) {
        return false;
      }
      if (size > max_size * 0.8 && !this.quota_warned) {
        this.quota_warned = true;
        Page.cmd("wrapperNotification", ["info", _("Your mailbox is almost full. Delete old sent messages to free up space.")]);
      }
      return true;
    }

    // Send an encrypted message to one or more recipients.
    // recipients: array of xid names (with or without .epix). The message is
    // encrypted once per member (recipients + self), so every member of the
    // conversation can read every reply.
    sendMessage(recipients, subject, body, conv_id, cb) {
      // Refuse to publish over an unsynced mailbox before touching this.data.
      this.guardContentWrite((may_write) => {
        if (!may_write) return cb(false);
        this._doSendMessage(recipients, subject, body, conv_id, cb);
      });
    }

    _doSendMessage(recipients, subject, body, conv_id, cb) {
      var my_xid = Crypto.normalizeXid(this.getMyXid());
      if (!my_xid) return cb(false);
      if (typeof recipients === "string") recipients = [recipients];

      // Canonical member list: normalized, deduped, self included, sorted
      var seen = {};
      var members = [];
      var others = [];
      for (var i = 0; i < recipients.length; i++) {
        var xid = Crypto.normalizeXid(recipients[i]);
        if (!xid || seen[xid]) continue;
        seen[xid] = true;
        members.push(xid);
        if (xid !== my_xid) others.push(xid);
      }
      if (!seen[my_xid]) members.push(my_xid);
      members.sort();

      if (!conv_id) {
        conv_id = Crypto.generateConversationId();
      }

      Crypto.resolveMemberPubkeys(others, (recipient_pubkeys, missing) => {
        if (missing.length > 0) {
          // No partial groups: a member we can't encrypt to would silently
          // never see the thread
          var names = missing.map(function(m) { return m.xid; }).join(", ");
          Page.cmd("wrapperNotification", ["error", _("Can't encrypt to:") + " " + names + " - " + missing[0].reason]);
          return cb(false);
        }
        this.getSenderPubkeys((sender_pubkeys) => {
          var all_pubkeys = {};
          for (var xid in recipient_pubkeys) {
            all_pubkeys[xid] = recipient_pubkeys[xid];
          }
          for (var sxid in sender_pubkeys) {
            all_pubkeys[sxid] = sender_pubkeys[sxid];
          }
          if (Object.keys(all_pubkeys).length !== members.length) {
            Page.cmd("wrapperNotification", ["error", _("Encryption failed")]);
            return cb(false);
          }
          var msg = JSON.stringify({subject: subject, body: body});
          Crypto.encryptForAll(msg, all_pubkeys, (ct) => {
            if (Object.keys(ct).length !== members.length) {
              Page.cmd("wrapperNotification", ["error", _("Encryption failed")]);
              return cb(false);
            }
            Crypto.signMessage(msg, (sig) => {
              if (typeof sig !== "string" || !sig) {
                Page.cmd("wrapperNotification", ["error", _("Signing failed")]);
                return cb(false);
              }
              var conv = this.getOrCreateConversation(members, conv_id);
              var ts = Date.now();
              while (conv.messages[ts.toString()]) ts++;
              conv.my_seq += 1;
              conv.messages[ts.toString()] = {
                seq: conv.my_seq,
                from_xid: my_xid,
                ct: ct,
                sig: sig,
                ts: ts
              };
              if (!this.checkSizeBudget()) {
                delete conv.messages[ts.toString()];
                conv.my_seq -= 1;
                if (Object.keys(conv.messages).length === 0 && conv.my_seq === 0) {
                  delete this.data.conversations[conv_id];
                }
                Page.cmd("wrapperNotification", ["error", _("Mailbox full - delete old sent messages first")]);
                return cb(false);
              }
              this.saveData().then((res) => {
                cb(res, {conv_id: conv_id, ts: ts});
              });
            });
          });
        });
      });
    }

    loadData(cb) {
      var inner_path = this.getInnerPath();
      this.log("Loading user file", inner_path);
      this.getMyXid();
      this.my_user_dir = Page.site_info.xid_directory || Page.site_info.auth_address;
      this.loadFileRules();
      var was_loaded = this.loaded.resolved;
      Page.cmd("fileGet", {"inner_path": inner_path, "required": false}, (get_res) => {
        if (get_res) {
          try {
            this.data = JSON.parse(get_res);
          } catch (e) {
            // A truncated/corrupt own file must not wedge the app forever on
            // the loading screen: surface it and treat as "no data" so setup
            // (or a later good sync) can recover.
            Page.cmd("wrapperNotification", ["error", _("Your mailbox file could not be read (it may still be downloading).")]);
            this.inited = true;
            if (!this.loaded.resolved) this.loaded.fail();
            if (cb) cb(false);
            Page.projector.scheduleRender();
            return;
          }
          this.data_size = this.getDataSize();
          this.publickey = this.data.publickey;
          // this.data now mirrors the real synced file: content writes are safe.
          this.data_loaded_from_file = true;
          this.loaded.resolve();
          if (cb) cb(true);
          this.inited = true;
          // A reload of the already-loaded file (e.g. this mailbox synced from
          // another device) must push the fresh data into the thread store;
          // the leading-edge reload fired earlier read the stale in-memory copy.
          if (was_loaded && Page.thread_store) {
            Page.thread_store.invalidate();
            Page.thread_store.load("noanim");
          }
          Page.projector.scheduleRender();
        } else {
          this.inited = true;
          if (cb) cb(false);
          Page.projector.scheduleRender();
        }
      });
    }

    createData() {
      var inner_path = this.getInnerPath();
      this.log("Creating user file", inner_path);
      this.data = {
        "publickey": null,
        "signed_prekey": null,
        "prekey_sig": null,
        "prekey_ts": null,
        "conversations": {},
        "date_added": Date.now()
      };
      Page.cmd("userPublickey", [0], (publickey_res) => {
        if (!publickey_res || publickey_res.error) {
          Page.cmd("wrapperNotification", ["error", _("Publickey read error:") + " " + ((publickey_res && publickey_res.error) || "unknown")]);
          this.loaded.fail();
          return;
        }
        this.data.publickey = publickey_res;
        this.publickey = publickey_res;
        Page.cmd("userPublickey", [1], (prekey_res) => {
          if (prekey_res && !prekey_res.error) {
            this.data.signed_prekey = prekey_res;
            this.data.prekey_ts = Date.now();
            Crypto.signPrekey(prekey_res, (sig) => {
              this.data.prekey_sig = sig;
              this.saveData().then((save_res) => {
                this.onDataCreated();
              });
            });
          } else {
            this.saveData().then((save_res) => {
              this.onDataCreated();
            });
          }
        });
      });
    }

    onDataCreated() {
      this.inited = true;
      // First-time account creation is allowed to publish the fresh default,
      // and after this write this.data is the canonical file for this user, so
      // subsequent content writes must not be blocked by the sync guard.
      this.data_loaded_from_file = true;
      this.loaded.resolve();
      Page.thread_store.invalidate();
      Page.thread_store.load();
      Page.projector.scheduleRender();
    }

    // Interim data-loss guard for content writes (send/delete). data.json is
    // read LOCAL-only via fileGet(required:false); on a device that has not
    // synced it, that read misses and this.data is null or a blank/default.
    // Publishing then (last-writer-wins) would wipe the user's real mailbox
    // everywhere. So before a content write, if this.data does not reflect a
    // real synced file, trigger one sync + re-read: if the real file shows up
    // use it (no clobber) and ask the user to retry; if it is still missing,
    // refuse to write. Account creation does not come through here.
    guardContentWrite(cb) {
      // Fast path: data.json was loaded from disk or freshly created by this
      // user - writing is safe. Preserve existing behavior exactly.
      if (this.data_loaded_from_file) return cb(true);

      var self = this;
      var done = false;
      var finish = function(proceed, notice) {
        if (done) return;
        done = true;
        if (notice) Page.cmd("wrapperNotification", ["info", notice]);
        cb(proceed);
      };
      // Never wedge a write forever if the sync command never calls back.
      var timer = setTimeout(function() {
        finish(false, _("Your data is still syncing, please try again in a moment."));
      }, 12000);

      var inner_path = this.getInnerPath();
      // Ask peers for this specific file, then re-read it.
      Page.cmd("fileNeed", {"inner_path": inner_path}, function() {
        self.loadData(function(loaded) {
          clearTimeout(timer);
          if (loaded && self.data_loaded_from_file) {
            // Real mailbox arrived: do not clobber it. The user's action was
            // composed against empty data, so have them retry against the real
            // data now loaded.
            finish(false, _("Your mailbox just finished syncing - please try again."));
          } else {
            // Still no real file after a sync attempt: refuse to overwrite a
            // possibly-existing remote file with a blank/default.
            finish(false, _("Your data is still syncing, please try again in a moment."));
          }
        });
      });
    }

    saveData(publish) {
      if (publish === undefined) publish = true;
      var promise = new Deferred();
      var inner_path = this.getInnerPath();
      this.data_size = this.getDataSize();
      Page.cmd("fileWrite", [inner_path, Text.fileEncode(this.data)], (write_res) => {
        if (write_res !== "ok") {
          Page.cmd("wrapperNotification", ["error", _("File write error:") + " " + write_res]);
          promise.fail();
          return false;
        }
        if (publish) {
          Page.cmd("sitePublish", {"inner_path": inner_path}, (publish_res) => {
            if (publish_res === "ok") {
              Page.projector.scheduleRender();
            }
            promise.resolve(true);
          });
        } else {
          promise.resolve(true);
        }
      });
      return promise;
    }

    loadFileRules() {
      if (this.file_rules === null && Page.site_info) {
        this.file_rules = {};
        // Rules govern the signed unit (the user's content.json), so query
        // that path - asking about data.json returns the generic site rules
        Page.cmd("fileRules", this.getInnerPath("content.json"), (res) => {
          this.file_rules = res || {};
          Page.projector.scheduleRender();
        });
      }
    }

    formatQuota() {
      this.loadFileRules();
      if (this.file_rules && this.file_rules.max_size && this.data_size !== null) {
        return parseInt(this.data_size / 1024 + 1) + "k / " + parseInt(this.file_rules.max_size / 1024) + "k";
      }
      return "";
    }

    reset() {
      this.data = null;
      this.publickey = null;
      this.data_size = null;
      this.file_rules = null;
      this.my_xid = null;
      this.my_user_dir = null;
      this.quota_warned = false;
      this.data_loaded_from_file = false;
      this.loading = false;
      this.inited = false;
      this._load_start = Date.now();
      this.loaded = new Deferred();
      this.loaded.then((res) => {
        this.loading = false;
        this.log("Loaded", res);
        Page.projector.scheduleRender();
      });
    }

    onSiteInfo(site_info) {
      if (!this.loading && site_info.event && site_info.event[0] === "file_done" && site_info.event[1] === this.getInnerPath()) {
        this.loadData();
      }
      if (site_info.event && site_info.event[0] === "cert_changed") {
        this.reset();
        if (site_info.cert_user_id) {
          this.loadData();
        } else {
          Page.projector.scheduleRender();
        }
      } else if (!this.data && !this.loading && site_info.cert_user_id && !site_info.event) {
        this.loadData();
      }
    }
  }

  Object.assign(User.prototype, LogMixin);
  window.User = User;

})();
