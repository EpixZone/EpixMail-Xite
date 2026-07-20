(function() {

  // Single source of truth for every folder view. Discovers conversations
  // that include me (my own file + every peer file whose conversation record
  // names me), decrypts messages through a shared cache, assembles them into
  // per-conversation threads with STABLE keys ("conv-" + conv_id) and
  // computes each thread's folder (inbox/archived/junk) from the private
  // settings. Inbox/Starred/Archived/Junk/Sent all render from this store,
  // so a background reload can never duplicate a thread row.
  class ThreadStore {
    constructor() {
      this.load = this.load.bind(this);
      this.threads = [];          // thread rows, newest first
      this.sent_rows = [];        // flat list of my own sent messages, newest first
      this.decrypted_cache = {};  // msg_key -> {subject, body} (false = undecryptable)
      this.loaded = false;
      this.loading = false;
      this.pending = false;       // a reload request arrived mid-load
      this.pending_mode = null;
      this.dirty = true;
      this.nolimit = false;
      this.has_more = false;
      this.conv_limit = 20;       // threads decrypted per pass until "Load more"
      this.gen = 0;               // bumped on reset; an in-flight load bails if stale
      this.newest_inbound_ts = 0; // high-water mark of inbound mail already seen
      this.on_loaded = new Deferred();
    }

    invalidate() {
      this.dirty = true;
    }

    reset() {
      this.gen += 1;              // abandon any in-flight load's callbacks
      this.threads = [];
      this.sent_rows = [];
      this.decrypted_cache = {};
      this.loaded = false;
      this.loading = false;
      this.pending = false;
      this.pending_mode = null;
      this.dirty = true;
      this.nolimit = false;
      this.has_more = false;
      this.newest_inbound_ts = 0;
      this.on_loaded = new Deferred();
    }

    // Every message has a globally unique identity: each participant only
    // writes their own messages into their own file, so (conv, author, ts)
    // never collides even when two members pick the same millisecond.
    msgKey(conv_id, from_xid, ts) {
      return conv_id + ":" + from_xid + ":" + ts;
    }

    // Member list of a conversation record. Legacy 1:1 records (no members)
    // derive it from peer_xid + me, so old threads keep working. In a peer's
    // OWN file the legacy peer_xid names the recipient (me), so it can't
    // identify the peer - fall back to the file's directory (their xid dir).
    parseMembers(conv, my_xid, directory) {
      var members = conv.members;
      if (typeof members === "string") {
        try {
          members = JSON.parse(members);
        } catch (e) {
          members = null;
        }
      }
      if (members && members.length) {
        return members;
      }
      var peer = Crypto.normalizeXid(conv.peer_xid) || my_xid;
      if (peer === my_xid && directory) {
        var dir_xid = Crypto.normalizeXid(directory);
        if (dir_xid !== my_xid) peer = dir_xid;
      }
      if (peer === my_xid) return [my_xid];
      return [peer, my_xid].sort();
    }

    load(mode, cb) {
      if (!Page.site_info || !Page.user) {
        if (cb) cb(false);
        return;
      }
      var my_xid = Crypto.normalizeXid(Page.user.getMyXid());
      var my_dir = Page.user.getMyXidDir();
      if (!my_xid || !my_dir) {
        this.threads = [];
        this.sent_rows = [];
        this.loaded = true;
        if (cb) cb(false);
        return;
      }
      if (this.loading) {
        // A file_done landed mid-load: queue exactly one follow-up pass
        this.pending = true;
        this.pending_mode = mode;
        return;
      }
      if (!this.dirty && this.loaded) {
        if (cb) cb(true);
        return;
      }
      this.loading = true;
      this.dirty = false;
      this.logStart("loadThreads");
      var gen = this.gen;
      Page.projector.scheduleRender();

      // Wait for both the mailbox (own messages, keys) and the private
      // settings (folders, tombstones, read state) so the first assembly is
      // correct instead of showing junked/deleted threads in the inbox.
      Deferred.when(Page.user.loaded, Page.on_local_storage).then(() => {
        if (gen !== this.gen) return;
        // Discovery: every peer file whose conversation record names me,
        // via legacy peer_xid or the members list (stored as JSON text, so
        // the quoted LIKE is exact). json.directory is the bare xid dir.
        var query = "SELECT conversation.conv_id, json.directory FROM conversation LEFT JOIN json USING (json_id) WHERE (conversation.peer_xid = ? OR conversation.members LIKE ?) AND json.directory != ? GROUP BY json.directory, conversation.conv_id";
        Page.cmd("dbQuery", [query, [my_dir, '%"' + my_dir + '"%', my_dir]], (conv_rows) => {
          if (!conv_rows || conv_rows.error) conv_rows = [];
          var dirs = {};
          for (var i = 0; i < conv_rows.length; i++) {
            if (conv_rows[i].directory && conv_rows[i].directory !== my_dir) {
              dirs[conv_rows[i].directory] = true;
            }
          }

          var raw_by_key = {};
          var conv_members = {};
          var addRaw = (row) => {
            var key = this.msgKey(row.conv_id, row.from_xid, row.ts);
            var existing = raw_by_key[key];
            if (!existing) {
              raw_by_key[key] = row;
            } else if (Crypto.normalizeXid(row.from_xid) === row.directory) {
              // Duplicate copy of the same logical message: the author's own
              // file is the authoritative one
              raw_by_key[key] = row;
            }
          };
          // Walk a whole user file: catches conversations the DB hasn't
          // indexed yet. The real gate is ct[my_dir] - a message encrypted
          // to me belongs in my mailbox.
          var collectFromFile = (directory, parsed) => {
            var convs = parsed && parsed.conversations;
            if (!convs) return;
            for (var conv_id in convs) {
              var conv = convs[conv_id];
              if (!conv || !conv.messages) continue;
              var members = null;
              for (var ts in conv.messages) {
                var msg = conv.messages[ts];
                if (!msg || !msg.ct || !msg.ct[my_dir]) continue;
                if (!members) {
                  members = this.parseMembers(conv, my_xid, directory);
                  // A canonical members list (or one derived from a file that
                  // names the peer) wins over a self-only legacy fallback
                  if (!conv_members[conv_id] || (conv_members[conv_id].length < 2 && members.length >= 2)) {
                    conv_members[conv_id] = members;
                  }
                }
                addRaw({
                  conv_id: conv_id,
                  from_xid: msg.from_xid,
                  ct: msg.ct,
                  sig: msg.sig,
                  ts: parseInt(ts),
                  seq: msg.seq,
                  directory: directory
                });
              }
            }
          };

          collectFromFile(my_dir, Page.user.data);

          var dir_list = Object.keys(dirs);
          var remaining = dir_list.length;
          var done = () => {
            if (gen !== this.gen) return;
            this.assemble(gen, raw_by_key, conv_members, my_xid, my_dir, cb);
          };
          if (remaining === 0) return done();
          for (var di = 0; di < dir_list.length; di++) {
            ((directory) => {
              Page.cmd("fileGet", {"inner_path": "data/users/" + directory + "/data.json", "required": false}, (data) => {
                if (gen !== this.gen) { remaining--; return; }
                if (data) {
                  try {
                    collectFromFile(directory, JSON.parse(data));
                  } catch (e) {
                    this.log("Failed to parse data.json for", directory);
                  }
                }
                remaining--;
                if (remaining === 0) done();
              });
            })(dir_list[di]);
          }
        });
      });
    }

    assemble(gen, raw_by_key, conv_members, my_xid, my_dir, cb) {
      var by_conv = {};
      var latest_ts = {};
      for (var key in raw_by_key) {
        var raw = raw_by_key[key];
        if (!by_conv[raw.conv_id]) by_conv[raw.conv_id] = [];
        by_conv[raw.conv_id].push(raw);
        if (!latest_ts[raw.conv_id] || raw.ts > latest_ts[raw.conv_id]) {
          latest_ts[raw.conv_id] = raw.ts;
        }
      }
      var conv_ids = Object.keys(by_conv).sort(function(a, b) {
        return latest_ts[b] - latest_ts[a];
      });
      this.has_more = !this.nolimit && conv_ids.length > this.conv_limit;
      if (!this.nolimit) {
        conv_ids = conv_ids.slice(0, this.conv_limit);
      }

      // Decrypt every message of the selected conversations (threads must be
      // complete for correct unread state); the shared cache makes reloads
      // nearly free.
      var to_decrypt = [];
      for (var ci = 0; ci < conv_ids.length; ci++) {
        var raws = by_conv[conv_ids[ci]];
        for (var ri = 0; ri < raws.length; ri++) {
          var raw = raws[ri];
          if (this.decrypted_cache[this.msgKey(raw.conv_id, raw.from_xid, raw.ts)] === undefined) {
            to_decrypt.push(raw);
          }
        }
      }
      this.decryptAll(to_decrypt, my_dir, () => {
        if (gen !== this.gen) return;
        var was_loaded = this.loaded;
        this.buildThreads(conv_ids, by_conv, conv_members, my_xid, my_dir);
        // Genuinely new inbound mail (past the high-water mark), for the
        // OS/browser notification. Advances newest_inbound_ts either way, so
        // the first (priming) pass never fires and reloads never double-fire.
        var new_inbound = this.collectNewInbound(by_conv, my_xid);
        this.logEnd("loadThreads", conv_ids.length + " threads");
        this.loading = false;
        this.loaded = true;
        this.on_loaded.resolve();
        Page.onThreadsAssembled(new_inbound, was_loaded);
        this.resolveAvatars();
        Page.projector.scheduleRender();
        if (cb) cb(true);
        if (this.pending) {
          this.pending = false;
          this.dirty = true;
          var pending_mode = this.pending_mode;
          this.pending_mode = null;
          this.load(pending_mode);
        }
      });
    }

    decryptAll(raws, my_dir, cb) {
      if (raws.length === 0) return cb();
      var remaining = raws.length;
      for (var i = 0; i < raws.length; i++) {
        ((raw) => {
          var key = this.msgKey(raw.conv_id, raw.from_xid, raw.ts);
          Page.cmd("eciesDecrypt", [raw.ct[my_dir]], (plaintext) => {
            if (plaintext) {
              try {
                var parsed = JSON.parse(plaintext);
                this.decrypted_cache[key] = {subject: parsed.subject || "", body: parsed.body || ""};
              } catch (e) {
                this.decrypted_cache[key] = false;
              }
            } else {
              this.decrypted_cache[key] = false;
            }
            remaining--;
            if (remaining === 0) cb();
          });
        })(raws[i]);
      }
    }

    // Deterministic cross-writer ordering: ts asc, then author asc, then seq.
    // Every member sees the identical order; per-writer seq is never compared
    // across writers.
    orderMessages(a, b) {
      if (a.ts !== b.ts) return a.ts - b.ts;
      if (a.from_xid < b.from_xid) return -1;
      if (a.from_xid > b.from_xid) return 1;
      return (a.seq || 0) - (b.seq || 0);
    }

    // Inbound (not mine) messages newer than the high-water mark, decrypted.
    // The mark advances past every inbound message seen this pass, so the
    // first load primes it (nothing counts as "new") and a later "Load more"
    // of older mail never counts either.
    collectNewInbound(by_conv, my_xid) {
      var found = [];
      var max_ts = this.newest_inbound_ts;
      for (var conv_id in by_conv) {
        var raws = by_conv[conv_id];
        for (var i = 0; i < raws.length; i++) {
          var raw = raws[i];
          if (Crypto.normalizeXid(raw.from_xid) === my_xid) continue;
          if (raw.ts > max_ts) max_ts = raw.ts;
          if (raw.ts <= this.newest_inbound_ts) continue;
          var dec = this.decrypted_cache[this.msgKey(raw.conv_id, raw.from_xid, raw.ts)];
          if (!dec) continue;
          found.push({
            conv_id: conv_id,
            from_xid: raw.from_xid,
            ts: raw.ts,
            subject: dec.subject,
            body: dec.body
          });
        }
      }
      this.newest_inbound_ts = max_ts;
      return found;
    }

    buildThreads(conv_ids, by_conv, conv_members, my_xid, my_dir) {
      var storage = Page.local_storage || {};
      var deleted = storage.deleted || [];
      var first_load = !this.loaded;
      var fragments = [];         // one per conv_id, merged below
      var sent_rows = [];

      for (var ci = 0; ci < conv_ids.length; ci++) {
        var conv_id = conv_ids[ci];
        var raws = by_conv[conv_id].slice().sort(this.orderMessages);
        var members = conv_members[conv_id] || [my_xid];
        var msgs = [];
        for (var ri = 0; ri < raws.length; ri++) {
          var raw = raws[ri];
          var msg_key = this.msgKey(raw.conv_id, raw.from_xid, raw.ts);
          var dec = this.decrypted_cache[msg_key];
          if (!dec) continue;
          // message_id keeps the legacy conv:ts format so existing delete
          // tombstones from the old client still apply
          var message_id = raw.conv_id + ":" + raw.ts;
          if (deleted.indexOf(message_id) !== -1) continue;
          var is_sent = Crypto.normalizeXid(raw.from_xid) === my_xid;
          var msg = {
            msg_key: msg_key,
            message_id: message_id,
            conv_id: conv_id,
            subject: dec.subject,
            body: dec.body,
            date_added: raw.ts,
            ts: raw.ts,
            seq: raw.seq,
            from_xid: raw.from_xid,
            folder: is_sent ? "sent" : "inbox",
            sig: raw.sig
          };
          msgs.push(msg);
          if (is_sent && raw.directory === my_dir) {
            sent_rows.push({
              key: "sent-" + conv_id + "-" + raw.ts,
              conv_id: conv_id,
              members: members,
              msg_key: msg_key,
              message_id: message_id,
              subject: dec.subject,
              body: dec.body,
              date_added: raw.ts,
              from_xid: raw.from_xid,
              thread_count: 1,
              folder: "sent"
            });
          }
        }
        if (msgs.length === 0) continue;
        fragments.push({conv_id: conv_id, members: members, msgs: msgs});
      }

      // Coalesce 1:1 fragments (identical two-member set) that were recorded
      // under different random conv_ids. Conversation ids are random per send
      // (Crypto.generateConversationId), so legacy data - and any "new
      // message" composed to an existing contact - can scatter one logical
      // conversation across several ids. Grouping by the member pair reunites
      // them into a single row. Group chats (3+ members) and notes-to-self
      // stay keyed by their own conv_id.
      var by_pair = {};
      var groups = [];
      for (var fi = 0; fi < fragments.length; fi++) {
        var frag = fragments[fi];
        if (frag.members.length === 2) {
          var pair_key = frag.members.join("|");
          if (!by_pair[pair_key]) {
            by_pair[pair_key] = [];
            groups.push(by_pair[pair_key]);
          }
          by_pair[pair_key].push(frag);
        } else {
          groups.push([frag]);
        }
      }

      var threads = [];
      for (var gi = 0; gi < groups.length; gi++) {
        threads.push(this.buildThreadFromFragments(groups[gi], my_xid, first_load));
      }

      threads.sort(function(a, b) { return b.date_added - a.date_added; });
      sent_rows.sort(function(a, b) { return b.date_added - a.date_added; });
      this.threads = threads;
      this.sent_rows = sent_rows;
    }

    // Assemble one thread row from one or more per-conv fragments sharing the
    // same members. conv_ids lists every underlying conversation id; conv_id
    // is the representative (the id carrying the newest message) used for
    // replies and navigation. Star/archive read every id in conv_ids, so
    // state survives even when the representative shifts to a newer id.
    buildThreadFromFragments(frags, my_xid, first_load) {
      var all_msgs = [];
      var conv_ids = [];
      var rep_conv_id = frags[0].conv_id;
      var rep_ts = -1;
      for (var i = 0; i < frags.length; i++) {
        conv_ids.push(frags[i].conv_id);
        var fmsgs = frags[i].msgs;
        for (var j = 0; j < fmsgs.length; j++) all_msgs.push(fmsgs[j]);
        var last = fmsgs[fmsgs.length - 1];
        if (last && last.ts > rep_ts) {
          rep_ts = last.ts;
          rep_conv_id = frags[i].conv_id;
        }
      }
      all_msgs.sort(this.orderMessages);
      var members = frags[0].members;
      var first = all_msgs[0];
      var latest = all_msgs[all_msgs.length - 1];
      var thread = {
        // 1:1 rows key on the member pair so the row stays stable as the
        // representative id moves; groups/self key on their conv_id
        key: members.length === 2 ? "pair-" + members.join("|") : "conv-" + rep_conv_id,
        conv_id: rep_conv_id,
        conv_ids: conv_ids,
        members: members,
        thread_messages: all_msgs,
        thread_count: all_msgs.length,
        date_added: latest.date_added,
        subject: first.subject || latest.subject,
        body: latest.body,
        from_xid: latest.from_xid,
        initiator: Crypto.normalizeXid(first.from_xid),
        peer_xid: this.firstOther(members, my_xid),
        disable_animation: first_load
      };
      this.applyThreadState(thread, my_xid);
      return thread;
    }

    firstOther(members, my_xid) {
      for (var i = 0; i < members.length; i++) {
        if (members[i] !== my_xid) return members[i];
      }
      return my_xid;
    }

    // Folder + star flags from the private settings. A thread is junk when
    // its INITIATOR is a junked sender (1:1: junking the peer counts too);
    // a junked member inside someone else's group does not junk the thread.
    applyThreadState(thread, my_xid) {
      var storage = Page.local_storage || {};
      var junk_senders = storage.junk_senders || [];
      var archived = storage.archived || {};
      var starred = storage.starred || {};
      var junk = junk_senders.indexOf(thread.initiator) !== -1;
      if (!junk && thread.members.length <= 2) {
        for (var i = 0; i < thread.members.length; i++) {
          if (thread.members[i] !== my_xid && junk_senders.indexOf(thread.members[i]) !== -1) {
            junk = true;
          }
        }
      }
      // A merged thread is archived/starred if ANY of its underlying
      // conversation ids carries the flag
      var ids = thread.conv_ids || [thread.conv_id];
      var is_archived = false, is_starred = false;
      for (var ai = 0; ai < ids.length; ai++) {
        if (archived[ids[ai]]) is_archived = true;
        if (starred[ids[ai]]) is_starred = true;
      }
      thread.folder = junk ? "junk" : (is_archived ? "archived" : "inbox");
      thread.starred = is_starred;
    }

    // Recompute folders/stars on the already built threads after a settings
    // change (archive/star/junk) - no re-query, no re-decrypt.
    applyFolders() {
      var my_xid = Crypto.normalizeXid(Page.user.getMyXid());
      for (var i = 0; i < this.threads.length; i++) {
        this.applyThreadState(this.threads[i], my_xid);
      }
      Page.projector.scheduleRender();
    }

    // Resolve by the representative id or any merged member id, so a link or
    // notification that carries a non-representative conv_id still lands on
    // the coalesced thread.
    getThread(conv_id) {
      for (var i = 0; i < this.threads.length; i++) {
        var t = this.threads[i];
        if (t.conv_id === conv_id) return t;
        if (t.conv_ids && t.conv_ids.indexOf(conv_id) !== -1) return t;
      }
      return null;
    }

    isThreadRead(thread) {
      var read = (Page.local_storage && Page.local_storage.read) || {};
      for (var i = 0; i < thread.thread_messages.length; i++) {
        var msg = thread.thread_messages[i];
        if (msg.folder !== "sent" && !read[msg.date_added]) return false;
      }
      return true;
    }

    markThreadRead(thread) {
      if (!Page.local_storage) return;
      var changed = false;
      for (var i = 0; i < thread.thread_messages.length; i++) {
        var msg = thread.thread_messages[i];
        if (msg.folder !== "sent" && !Page.local_storage.read[msg.date_added]) {
          Page.local_storage.read[msg.date_added] = true;
          changed = true;
        }
      }
      if (changed) {
        Page.saveLocalStorage();
        Page.projector.scheduleRender();
      }
    }

    // Gmail-style "mark as unread": drop the read flag from every inbound
    // message of the thread so the row goes bold again.
    markThreadUnread(thread) {
      if (!Page.local_storage || !Page.local_storage.read) return;
      var changed = false;
      for (var i = 0; i < thread.thread_messages.length; i++) {
        var msg = thread.thread_messages[i];
        if (msg.folder !== "sent" && Page.local_storage.read[msg.date_added]) {
          delete Page.local_storage.read[msg.date_added];
          changed = true;
        }
      }
      if (changed) {
        Page.saveLocalStorage();
        Page.projector.scheduleRender();
      }
    }

    unreadCount() {
      var count = 0;
      for (var i = 0; i < this.threads.length; i++) {
        if (this.threads[i].folder === "inbox" && !this.isThreadRead(this.threads[i])) {
          count++;
        }
      }
      return count;
    }

    // Every conv_id merged into the thread this id belongs to, so a flag set
    // or cleared on a coalesced 1:1 thread covers all of its underlying ids.
    threadConvIds(conv_id) {
      var thread = this.getThread(conv_id);
      return (thread && thread.conv_ids) || [conv_id];
    }

    toggleStar(conv_id) {
      if (!Page.local_storage) return;
      if (!Page.local_storage.starred) Page.local_storage.starred = {};
      var ids = this.threadConvIds(conv_id);
      var starred = Page.local_storage.starred;
      var was_starred = false;
      for (var i = 0; i < ids.length; i++) {
        if (starred[ids[i]]) was_starred = true;
        delete starred[ids[i]];
      }
      if (!was_starred) starred[conv_id] = true;
      Page.saveLocalStorage();
      this.applyFolders();
    }

    setArchived(conv_id, is_archived) {
      if (!Page.local_storage) return;
      if (!Page.local_storage.archived) Page.local_storage.archived = {};
      var ids = this.threadConvIds(conv_id);
      var archived = Page.local_storage.archived;
      for (var i = 0; i < ids.length; i++) delete archived[ids[i]];
      if (is_archived) archived[conv_id] = true;
      Page.saveLocalStorage();
      this.applyFolders();
    }

    isJunkSender(xid) {
      var junk_senders = (Page.local_storage && Page.local_storage.junk_senders) || [];
      return junk_senders.indexOf(Crypto.normalizeXid(xid)) !== -1;
    }

    setJunkSender(xid, junked) {
      if (!Page.local_storage) return;
      xid = Crypto.normalizeXid(xid);
      if (!Page.local_storage.junk_senders) Page.local_storage.junk_senders = [];
      var list = Page.local_storage.junk_senders;
      var index = list.indexOf(xid);
      if (junked && index === -1) {
        list.push(xid);
      } else if (!junked && index !== -1) {
        list.splice(index, 1);
      }
      Page.saveLocalStorage();
      this.applyFolders();
    }

    // Local delete: tombstone every message of the thread in the private
    // settings (the encrypted copies on other peers' files are theirs)
    deleteThread(thread) {
      if (!Page.local_storage) return;
      if (!Page.local_storage.deleted) Page.local_storage.deleted = [];
      for (var i = 0; i < thread.thread_messages.length; i++) {
        var mid = thread.thread_messages[i].message_id;
        if (Page.local_storage.deleted.indexOf(mid) === -1) {
          Page.local_storage.deleted.push(mid);
        }
      }
      Page.saveLocalStorage();
      var index = this.threads.indexOf(thread);
      if (index !== -1) this.threads.splice(index, 1);
      // Drop the deleted conversation's own messages from Sent too, so they
      // don't linger there until the next full reload.
      var deleted = Page.local_storage.deleted;
      this.sent_rows = this.sent_rows.filter(function(row) {
        return deleted.indexOf(row.message_id) === -1;
      });
      Page.projector.scheduleRender();
    }

    // Resolve xID chain profiles (avatars) for everyone visible in the store
    resolveAvatars() {
      var names = {};
      for (var i = 0; i < this.threads.length; i++) {
        var members = this.threads[i].members;
        for (var mi = 0; mi < members.length; mi++) {
          names[members[mi]] = true;
        }
      }
      var list = Object.keys(names);
      if (list.length) {
        Page.resolveXidProfiles(list, function() {
          Page.projector.scheduleRender();
        });
      }
    }

    // All contacts I share a conversation with (for autocomplete + Contacts)
    getContacts() {
      var my_xid = Crypto.normalizeXid(Page.user.getMyXid());
      var contacts = {};
      for (var i = 0; i < this.threads.length; i++) {
        var members = this.threads[i].members;
        for (var mi = 0; mi < members.length; mi++) {
          if (members[mi] !== my_xid) contacts[members[mi]] = true;
        }
      }
      // Own file may hold conversations not (yet) in the thread window
      var convs = Page.user.data && Page.user.data.conversations;
      if (convs) {
        for (var conv_id in convs) {
          var members2 = this.parseMembers(convs[conv_id], my_xid);
          for (var mj = 0; mj < members2.length; mj++) {
            if (members2[mj] !== my_xid) contacts[members2[mj]] = true;
          }
        }
      }
      return Object.keys(contacts).sort();
    }
  }

  Object.assign(ThreadStore.prototype, LogMixin);
  window.ThreadStore = ThreadStore;

})();
