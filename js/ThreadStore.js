// ThreadStore.js — the folder view-model, now sourced from the node's PRIVATE
// channel index instead of decrypting shared data in the page.
//
// The old store discovered conversations with a plaintext `message.ct LIKE
// '%"<name>"%'` dbQuery (which leaked the social graph) and decrypted every
// message in the browser. That is gone: the node trial-decrypts the anonymous
// pool locally and indexes the result, and this store just reads `channelList`
// / `channelConversation` / `channelSearch` and maps rows into the exact shape
// the render layer already expects (key "conv-"+conv_id, members, subject,
// body, date_added, thread_count, folder, starred, from_xid, unread,
// thread_messages). No key or ciphertext ever reaches the page.
(function () {
  "use strict";

  class ThreadStore {
    constructor() {
      this.load = this.load.bind(this);
      this.threads = [];
      this.sent_rows = [];
      this.loaded = false;
      this.loading = false;
      this.pending = false;
      this.dirty = true;
      this.nolimit = false;
      this.has_more = {};
      this.conv_limit = 50;
      this.gen = 0;
      this._contacts = [];
      this._contactsRequest = null;
      this._junk = {};
      this._loaded_resolved = false;
      this.on_loaded = new Deferred();
    }

    invalidate() {
      this.dirty = true;
      this.invalidateContacts();
    }

    reset() {
      this.gen += 1;
      this._contacts = [];
      this.invalidateContacts();
      this._junk = {};
      this.threads = [];
      this.sent_rows = [];
      this.loaded = false;
      this.loading = false;
      this.pending = false;
      this.dirty = true;
      this.nolimit = false;
      this.has_more = {};
      this._loaded_resolved = false;
      this.on_loaded = new Deferred();
    }

    _members(row) {
      var members = row.members;
      if (typeof members === "string") {
        try {
          members = JSON.parse(members);
        } catch (e) {
          members = null;
        }
      }
      var names = Array.isArray(members)
        ? members.filter((name) => typeof name === "string" && name.trim())
        : [];
      if (!names.length && typeof row.peer_xid === "string") return [row.peer_xid];
      return names;
    }

    _mapThread(r) {
      var peer = r.peer_xid || "";
      var members = this._members(r);
      return {
        key: "conv-" + r.conv_id,
        conv_id: r.conv_id,
        members: members,
        peer_xid: peer,
        from_xid: peer,
        initiator: peer,
        subject: r.subject || "",
        body: r.snippet || "",
        date_added: r.last_ms || 0,
        thread_count: r.msg_count || 0,
        seq: r.msg_count || 0,
        unread: r.unread || 0,
        starred: !!r.starred,
        folder: r.archived ? "archived" : "inbox",
        thread_messages: null,
        disable_animation: false,
      };
    }

    // Sent: one flat row per message I wrote, from the node's private index
    // (`channelSent`). Same shape the row renderer expects for
    // folder === "sent": immutable key, members, subject, body, date_added.
    _mapSent(m) {
      var members = this._members(m);
      return {
        key: "sent-" + m.msg_id,
        msg_id: m.msg_id,
        conv_id: m.conv_id,
        members: members,
        subject: m.subject || "",
        body: m.body || "",
        from_xid: Page.user.getMyXid(),
        date_added: m.sent_ms || 0,
        thread_count: 1,
        starred: false,
        unread: 0,
        folder: "sent",
        thread_messages: null,
      };
    }

    async _readPages(read, all, gen) {
      const limit = this.conv_limit;
      const rows = [];
      for (;;) {
        const page = await read(rows.length, limit);
        rows.push(...page);
        if (!all || page.length < limit || gen !== this.gen) return rows;
      }
    }

    load(mode, cb) {
      const gen = ++this.gen;
      const all = this.nolimit;
      const folder = (name) => (offset, limit) => Page.channel.threads(name, offset, limit);
      this.loading = true;
      // The node's "all" folder excludes archived conversations.
      Promise.all([
        this._readPages(folder("all"), all, gen),
        this._readPages(folder("archived"), all, gen),
        this._readPages((offset, limit) => Page.channel.sent(offset, limit), all, gen)
      ])
        .then(([inbox, archived, sent]) => {
          if (gen !== this.gen) return;
          this.sent_rows = sent.map((m) => this._mapSent(m));
          this.threads = inbox.concat(archived).map((r) => this._mapThread(r));
          this.has_more = {
            inbox: !all && inbox.length === this.conv_limit,
            archived: !all && archived.length === this.conv_limit,
            sent: !all && sent.length === this.conv_limit
          };
          this.has_more.starred = this.has_more.inbox || this.has_more.archived;
          this.loaded = true;
          this.loading = false;
          this.dirty = false;
          if (!this._loaded_resolved) {
            this._loaded_resolved = true;
            this.on_loaded.resolve(true);
          }
          Page.projector.scheduleRender();
          if (cb) cb();
        })
        .catch((e) => {
          if (gen !== this.gen) return;
          this.loading = false;
          if (cb) cb(e);
        });
    }

    // Lazily fill a thread's message list from the node.
    getThread(conv_id) {
      var t = this.threads.find((row) => row.conv_id === conv_id);
      if (!t) return null;
      if (t.thread_messages === null) {
        t.thread_messages = []; // mark "loading" so we fetch once
        Page.channel
          .conversation(conv_id)
          .then((msgs) => {
            var mine = Page.user.getMyXid && Page.user.getMyXid();
            t.thread_messages = msgs.map((m) => ({
              key: "msg-" + m.msg_id,
              msg_id: m.msg_id,
              is_sent: m.dir === "out",
              from_xid: m.dir === "out" ? mine : m.sender_xid || t.from_xid,
              subject: m.subject || "",
              body: m.body || "",
              date_added: m.sent_ms || 0,
              seq: 0,
            }));
            if (!t.subject && t.thread_messages.length) t.subject = t.thread_messages[0].subject;
            Page.projector.scheduleRender();
          })
          .catch(() => {});
      }
      return t;
    }

    markThreadRead(thread) {
      thread.unread = 0;
      Page.channel.markRead(thread.conv_id, true).catch(() => {});
      Page.projector.scheduleRender();
    }

    markThreadUnread(thread) {
      thread.unread = 1;
      Page.channel.markRead(thread.conv_id, false).catch(() => {});
      Page.projector.scheduleRender();
    }

    isThreadRead(thread) {
      return !thread.unread;
    }

    deleteThread(thread) {
      this.threads = this.threads.filter((t) => t.conv_id !== thread.conv_id);
      Page.channel.deleteLocal(thread.conv_id).catch(() => {});
      Page.projector.scheduleRender();
    }

    unreadCount() {
      return this.threads.reduce((n, t) => n + (t.folder === "inbox" && t.unread > 0 ? 1 : 0), 0);
    }

    // Star / archive persist in the node's private index (per-device state, by
    // design — the sealed pool records are immutable). Junk stays client-local
    // (no junk column yet). Optimistic update, then fire the node write.
    toggleStar(conv_id) {
      var t = this.threads.filter((x) => x.conv_id === conv_id)[0];
      if (t) t.starred = !t.starred;
      Page.projector.scheduleRender();
      if (t) Page.channel.setConvState(conv_id, {starred: !!t.starred}).catch(() => {});
    }
    setArchived(conv_id, is_archived) {
      var t = this.threads.filter((x) => x.conv_id === conv_id)[0];
      if (t) t.folder = is_archived ? "archived" : "inbox";
      Page.projector.scheduleRender();
      Page.channel.setConvState(conv_id, {archived: !!is_archived}).catch(() => {});
    }
    isJunkSender(xid) {
      return !!this._junk[Crypto.normalizeXid(xid)];
    }
    setJunkSender(xid, junked) {
      this._junk[Crypto.normalizeXid(xid)] = !!junked;
      Page.projector.scheduleRender();
    }

    invalidateContacts() {
      this._contactsRequest = null;
    }

    getContacts() {
      var mine = Crypto.normalizeXid(Page.user.getMyXid());
      if (mine && !this._contactsRequest) {
        var request = {};
        this._contactsRequest = request;
        this._loadContacts(mine, request).catch(() => {
          if (this._contactsRequest === request) this.invalidateContacts();
        });
      }
      return this._contacts;
    }

    async _loadContacts(mine, request) {
      // Outgoing mail keeps its recipients in members, even before anyone
      // replies. Older incoming threads can have only a peer_xid.
      var names = new Set();
      var limit = 100;
      for (var folder of ["all", "archived"]) {
        for (var offset = 0; ; offset += limit) {
          var rows = await Page.channel.threads(folder, offset, limit);
          if (this._contactsRequest !== request) return;
          for (var row of rows) {
            for (var name of [...this._members(row), row.peer_xid]) {
              if (typeof name !== "string" || !name.trim()) continue;
              var xid = Crypto.normalizeXid(name);
              if (xid !== ".epix" && xid !== mine) names.add(xid);
            }
          }
          if (rows.length < limit) break;
        }
      }
      this._contacts = Array.from(names).sort();
      Page.projector.scheduleRender();
    }

    resolveAvatars() {
      var names = {};
      this.threads.forEach((t) => (t.members || []).forEach((m) => (names[m] = 1)));
      var missing = Object.keys(names).filter(
        (n) => !(Page.xid_profiles && Page.xid_profiles[n])
      );
      if (missing.length) {
        Page.cmd("xidResolveBatch", [missing], (results) => {
          Page.xid_profiles = Page.xid_profiles || {};
          if (results) Object.keys(results).forEach((k) => (Page.xid_profiles[k] = results[k]));
          Page.projector.scheduleRender();
        });
      }
    }
  }

  window.ThreadStore = ThreadStore;
})();
