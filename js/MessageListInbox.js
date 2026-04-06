(function() {

  class MessageListInbox extends MessageList {
    constructor(message_lists) {
      super(message_lists);
      this.reload = true;
      this.loading = false;
      this.loading_message = "Loading...";
      this.nolimit_loaded = false;
      this.messages = [];
      this.decrypted_cache = {};
      this.title = "Inbox";
    }

    loadConversationMessages(limit, cb) {
      var my_xid_dir = Page.user.my_user_dir || Page.site_info.xid_directory || Page.site_info.auth_address;
      var my_xid = Page.user.getMyXid();
      if (!my_xid) return cb([]);

      var query = "SELECT conversation.*, json.directory FROM conversation LEFT JOIN json USING (json_id) WHERE conversation.peer_xid = ? AND json.directory != ? ORDER BY conversation.established DESC";
      Page.cmd("dbQuery", [query, [my_xid_dir, "data/users/" + my_xid_dir]], (conv_rows) => {
        if (!conv_rows || conv_rows.length === 0) {
          this.loadOwnConversations(my_xid_dir, limit, (own_rows) => {
            this.decryptAndBuildMessages(own_rows, limit, cb);
          });
          return;
        }

        var message_rows = [];
        var remaining = conv_rows.length;
        for (var ci = 0; ci < conv_rows.length; ci++) {
          ((conv_row) => {
            var inner_path = "data/users/" + conv_row.directory + "/data.json";
            Page.cmd("fileGet", {"inner_path": inner_path, "required": false}, (data) => {
              if (data) {
                try {
                  var parsed = JSON.parse(data);
                  var conv = parsed && parsed.conversations && parsed.conversations[conv_row.conv_id];
                  if (conv && conv.messages) {
                    for (var ts in conv.messages) {
                      var msg = conv.messages[ts];
                      if (msg.ct && msg.ct[my_xid_dir]) {
                        message_rows.push({
                          conv_id: conv_row.conv_id,
                          peer_xid: conv_row.peer_xid,
                          from_xid: msg.from_xid,
                          ct: msg.ct,
                          sig: msg.sig,
                          ts: parseInt(ts),
                          seq: msg.seq,
                          directory: conv_row.directory
                        });
                      }
                    }
                  }
                } catch (e) {
                  console.log("Failed to parse data.json for", conv_row.directory);
                }
              }
              remaining--;
              if (remaining === 0) {
                this.loadOwnConversations(my_xid_dir, limit, (own_rows) => {
                  var all_rows = message_rows.concat(own_rows);
                  this.decryptAndBuildMessages(all_rows, limit, cb);
                });
              }
            });
          })(conv_rows[ci]);
        }
      });
    }

    loadOwnConversations(my_xid_dir, limit, cb) {
      if (!Page.user.data || !Page.user.data.conversations) return cb([]);
      var message_rows = [];
      var conversations = Page.user.data.conversations;
      for (var conv_id in conversations) {
        var conv = conversations[conv_id];
        for (var ts in conv.messages) {
          var msg = conv.messages[ts];
          if (msg.ct && msg.ct[my_xid_dir]) {
            message_rows.push({
              conv_id: conv_id,
              peer_xid: conv.peer_xid,
              from_xid: msg.from_xid,
              ct: msg.ct,
              sig: msg.sig,
              ts: parseInt(ts),
              seq: msg.seq,
              directory: my_xid_dir
            });
          }
        }
      }
      cb(message_rows);
    }

    decryptAndBuildMessages(raw_rows, limit, cb) {
      var my_xid_dir = Page.user.my_user_dir || Page.site_info.xid_directory || Page.site_info.auth_address;
      raw_rows.sort(function(a, b) { return b.ts - a.ts; });

      if (limit) {
        raw_rows = raw_rows.slice(0, limit + 1);
      }

      if (raw_rows.length === 0) {
        this.syncMessages([]);
        this.loading = false;
        this.loaded = true;
        Page.projector.scheduleRender();
        return cb([]);
      }

      var message_rows = [];
      var remaining = raw_rows.length;
      for (var ri = 0; ri < raw_rows.length; ri++) {
        ((raw) => {
          var cache_key = raw.conv_id + ":" + raw.ts;
          if (this.decrypted_cache[cache_key]) {
            message_rows.push(this.decrypted_cache[cache_key]);
            remaining--;
            if (remaining === 0) this.finishLoad(message_rows, limit, cb);
            return;
          }

          var my_ct = raw.ct[my_xid_dir];
          if (!my_ct) {
            remaining--;
            if (remaining === 0) this.finishLoad(message_rows, limit, cb);
            return;
          }

          Page.cmd("eciesDecrypt", [my_ct], (plaintext) => {
            if (plaintext) {
              try {
                var parsed = JSON.parse(plaintext);
                var my_xid = Page.user.getMyXid();
                var is_sent = (raw.from_xid === my_xid);
                var message_row = {
                  subject: parsed.subject || "",
                  body: parsed.body || "",
                  date_added: raw.ts,
                  key: "msg-" + raw.conv_id + "-" + raw.ts,
                  message_id: raw.conv_id + ":" + raw.ts,
                  from_xid: raw.from_xid,
                  peer_xid: raw.peer_xid,
                  from: raw.from_xid,
                  from_address: raw.directory,
                  folder: is_sent ? "sent" : "inbox",
                  conv_id: raw.conv_id,
                  sig: raw.sig,
                  verified: null
                };
                this.decrypted_cache[cache_key] = message_row;
                message_rows.push(message_row);
              } catch (e) {
                console.log("Failed to parse decrypted message", e);
              }
            }
            remaining--;
            if (remaining === 0) this.finishLoad(message_rows, limit, cb);
          });
        })(raw_rows[ri]);
      }
    }

    finishLoad(message_rows, limit, cb) {
      message_rows.sort(function(a, b) { return b.date_added - a.date_added; });
      var deleted = (Page.local_storage && Page.local_storage.deleted) || [];
      message_rows = message_rows.filter(function(row) { return deleted.indexOf(row.message_id) === -1; });

      this.syncMessages(message_rows);
      this.has_more = limit && message_rows.length > limit && !this.nolimit_loaded;
      Page.projector.scheduleRender();
      cb(message_rows);
    }

    triggerLoad(mode) {
      if (!mode) mode = "normal";
      var limit;
      if (mode === "nolimit") {
        limit = null;
        this.nolimit_loaded = true;
      } else {
        limit = 15;
      }
      if (!this.reload || !Page.site_info) return;
      this.loading = true;
      this.reload = false;
      this.logStart("getMessages");
      this.setLoadingMessage("Scanning conversations...");
      Page.user.loaded.then(() => {
        this.loadConversationMessages(limit, (message_rows) => {
          this.logEnd("getMessages", "Loaded " + message_rows.length + " messages");
          Page.saveLocalStorage();
          this.loading = false;
          this.loaded = true;
          Page.projector.scheduleRender();
        });
      });
    }

    deleteMessage(message) {
      super.deleteMessage(message);
      if (Page.local_storage.deleted.indexOf(message.row.message_id) === -1) {
        Page.local_storage.deleted.push(message.row.message_id);
      }
    }

    save() {
      Page.saveLocalStorage();
    }
  }

  window.MessageListInbox = MessageListInbox;

})();
