(function() {

  class User {
    constructor() {
      this.data = null;
      this.publickey = null;
      this.data_size = null;
      this.file_rules = null;
      this.my_xid = null;
      this.my_user_dir = null;

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

    getConversationId(peer_xid, cb) {
      var my_xid = this.getMyXid();
      if (!my_xid) return cb(null);
      Crypto.getConversationId(my_xid, peer_xid, cb);
    }

    getConversation(peer_xid, cb) {
      this.getConversationId(peer_xid, (conv_id) => {
        if (!conv_id) return cb(null);
        if (!this.data.conversations) {
          this.data.conversations = {};
        }
        if (this.data.conversations[conv_id]) {
          return cb(this.data.conversations[conv_id], conv_id);
        }
        var conv = {
          peer_xid: peer_xid,
          established: Date.now(),
          my_seq: 0,
          messages: {}
        };
        this.data.conversations[conv_id] = conv;
        cb(conv, conv_id);
      });
    }

    // Get or create conversation only after message is ready — avoids persisting empty conversations on send failure
    getOrCreateConversation(peer_xid, conv_id) {
      if (!this.data.conversations) {
        this.data.conversations = {};
      }
      if (this.data.conversations[conv_id]) {
        return this.data.conversations[conv_id];
      }
      var conv = {
        peer_xid: peer_xid,
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
      var my_xid_dir = this.my_user_dir || Page.site_info.xid_directory || Page.site_info.auth_address;
      var result = {};
      result[my_xid_dir] = pubkey;
      cb(result);
    }

    sendMessage(peer_xid, subject, body, cb) {
      var my_xid = this.getMyXid();
      if (!my_xid) return cb(false);
      this.getConversationId(peer_xid, (conv_id) => {
        if (!conv_id) return cb(false);
        Crypto.resolveAllPubkeys(peer_xid, (recipient_pubkeys, err) => {
          if (isEmpty(recipient_pubkeys)) {
            Page.cmd("wrapperNotification", ["error", err || "Could not find encryption keys for " + peer_xid]);
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
            var msg = JSON.stringify({subject: subject, body: body});
            Crypto.encryptForAll(msg, all_pubkeys, (ct) => {
              if (isEmpty(ct)) {
                Page.cmd("wrapperNotification", ["error", "Encryption failed"]);
                return cb(false);
              }
              Crypto.signMessage(msg, (sig) => {
                if (!sig) {
                  Page.cmd("wrapperNotification", ["error", "Signing failed"]);
                  return cb(false);
                }
                // Only create/persist the conversation after encryption + signing succeed
                var conv = this.getOrCreateConversation(peer_xid, conv_id);
                conv.my_seq += 1;
                var ts = Date.now();
                conv.messages[ts.toString()] = {
                  seq: conv.my_seq,
                  from_xid: my_xid,
                  ct: ct,
                  sig: sig,
                  ts: ts
                };
                this.saveData().then((res) => {
                  cb(res);
                });
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
      Page.cmd("fileGet", {"inner_path": inner_path, "required": false}, (get_res) => {
        if (get_res) {
          this.data_size = get_res.length;
          this.data = JSON.parse(get_res);
          var elapsed = Date.now() - (this._load_start || Date.now());
          var delay = Math.max(0, 2500 - elapsed);
          setTimeout(() => {
            this.publickey = this.data.publickey;
            this.loaded.resolve();
            if (cb) cb(true);
            this.inited = true;
            Page.projector.scheduleRender();
          }, delay);
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
          Page.cmd("wrapperNotification", ["error", "Publickey read error: " + ((publickey_res && publickey_res.error) || "unknown")]);
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
      this.loaded.resolve();
      Page.message_lists.inbox.reload = true;
      Page.message_lists.sent.reload = true;
      Page.projector.scheduleRender();
    }

    saveData(publish) {
      if (publish === undefined) publish = true;
      var promise = new Deferred();
      var inner_path = this.getInnerPath();
      this.data_size = Text.fileEncode(this.data).length;
      Page.cmd("fileWrite", [inner_path, Text.fileEncode(this.data)], (write_res) => {
        if (write_res !== "ok") {
          Page.cmd("wrapperNotification", ["error", "File write error: " + write_res]);
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

    formatQuota() {
      if (!this.file_rules) {
        if (Page.site_info) {
          this.file_rules = {};
          Page.cmd("fileRules", this.getInnerPath(), (res) => {
            this.file_rules = res;
          });
        }
        return " ";
      } else {
        if (this.file_rules.max_size) {
          return parseInt(this.data_size / 1024 + 1) + "k/" + parseInt(this.file_rules.max_size / 1024) + "k";
        } else {
          return " ";
        }
      }
    }

    reset() {
      this.data = null;
      this.publickey = null;
      this.data_size = null;
      this.file_rules = null;
      this.my_xid = null;
      this.my_user_dir = null;
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
