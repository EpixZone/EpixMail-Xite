(function() {

  class MessageListSent extends MessageList {
    constructor(message_lists) {
      super(message_lists);
      this.reload = true;
      this.loading = false;
      this.nolimit_loaded = false;
      this.messages = [];
      this.decrypted_cache = {};
      this.title = "Sent";
    }

    triggerLoad(mode, cb) {
      if (!mode) mode = "normal";
      if (!cb) cb = null;
      var limit;
      if (mode === "nolimit") {
        limit = null;
        this.nolimit_loaded = true;
      } else {
        limit = 15;
      }
      if (!this.reload || !Page.site_info || !Page.site_info.cert_user_id || this.loading) {
        if (cb) cb(false);
        return;
      }
      this.reload = false;
      this.loading = true;
      this.setLoadingMessage("Loading sent messages...");
      Page.user.loaded.then(() => {
        if (!Page.user.data || !Page.user.data.conversations) {
          this.loading = false;
          this.loaded = true;
          Page.projector.scheduleRender();
          if (cb) cb(false);
          return;
        }

        var my_xid_dir = Page.user.my_user_dir || Page.site_info.xid_directory || Page.site_info.auth_address;
        var my_xid = Page.user.getMyXid();
        var raw_messages = [];

        for (var conv_id in Page.user.data.conversations) {
          var conv = Page.user.data.conversations[conv_id];
          for (var ts in conv.messages) {
            var msg = conv.messages[ts];
            if (msg.from_xid === my_xid && msg.ct && msg.ct[my_xid_dir]) {
              raw_messages.push({
                conv_id: conv_id,
                peer_xid: conv.peer_xid,
                from_xid: msg.from_xid,
                ct: msg.ct,
                sig: msg.sig,
                ts: parseInt(ts),
                seq: msg.seq
              });
            }
          }
        }

        raw_messages.sort(function(a, b) { return b.ts - a.ts; });

        if (limit) {
          raw_messages = raw_messages.slice(0, limit + 1);
        }

        if (raw_messages.length === 0) {
          this.syncMessages([]);
          this.loading = false;
          this.loaded = true;
          Page.projector.scheduleRender();
          if (cb) cb(true);
          return;
        }

        var message_rows = [];
        var remaining = raw_messages.length;
        for (var ri = 0; ri < raw_messages.length; ri++) {
          ((raw) => {
            var cache_key = raw.conv_id + ":" + raw.ts;
            if (this.decrypted_cache[cache_key]) {
              message_rows.push(this.decrypted_cache[cache_key]);
              remaining--;
              if (remaining === 0) this.finishSentLoad(message_rows, limit, cb);
              return;
            }

            var my_ct = raw.ct[my_xid_dir];
            if (!my_ct) {
              remaining--;
              if (remaining === 0) this.finishSentLoad(message_rows, limit, cb);
              return;
            }

            Page.cmd("eciesDecrypt", [my_ct], (plaintext) => {
              if (plaintext) {
                try {
                  var parsed = JSON.parse(plaintext);
                  var message_row = {
                    subject: parsed.subject || "",
                    body: parsed.body || "",
                    date_added: raw.ts,
                    key: "sent-" + raw.conv_id + "-" + raw.ts,
                    message_id: raw.conv_id + ":" + raw.ts,
                    from_xid: raw.from_xid,
                    peer_xid: raw.peer_xid,
                    to: raw.peer_xid,
                    to_address: "",
                    folder: "sent",
                    conv_id: raw.conv_id,
                    sig: raw.sig
                  };
                  this.decrypted_cache[cache_key] = message_row;
                  message_rows.push(message_row);
                } catch (e) {
                  console.log("Failed to parse sent message", e);
                }
              }
              remaining--;
              if (remaining === 0) this.finishSentLoad(message_rows, limit, cb);
            });
          })(raw_messages[ri]);
        }
      });
    }

    finishSentLoad(message_rows, limit, cb) {
      message_rows.sort(function(a, b) { return b.date_added - a.date_added; });
      var deleted = (Page.local_storage && Page.local_storage.deleted) || [];
      message_rows = message_rows.filter(function(row) { return deleted.indexOf(row.message_id) === -1; });

      this.syncMessages(message_rows);
      this.has_more = limit && message_rows.length > limit && !this.nolimit_loaded;
      Page.projector.scheduleRender();
      this.loading = false;
      this.loaded = true;
      if (cb) cb(true);
    }

    deleteMessage(message) {
      super.deleteMessage(message);
      var parts = message.row.message_id.split(":");
      var conv_id = parts[0];
      var ts = parts[1];
      if (Page.user.data && Page.user.data.conversations &&
          Page.user.data.conversations[conv_id] &&
          Page.user.data.conversations[conv_id].messages &&
          Page.user.data.conversations[conv_id].messages[ts]) {
        delete Page.user.data.conversations[conv_id].messages[ts];
      }
    }

    save() {
      Page.user.saveData().then((res) => {
        this.log("Delete result", res);
      });
    }
  }

  window.MessageListSent = MessageListSent;

})();
