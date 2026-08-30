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
      this.has_more = false;
      this.conv_limit = 50;
      this.pages = 1;
      this.gen = 0;
      this._contacts = [];
      this._junk = {};
      this._loaded_resolved = false;
      this.on_loaded = new Deferred();
    }

    invalidate() {
      this.dirty = true;
    }

    reset() {
      this.gen += 1;
      this.threads = [];
      this.sent_rows = [];
      this.loaded = false;
      this.loading = false;
      this.pending = false;
      this.dirty = true;
      this.nolimit = false;
      this.has_more = false;
      this.pages = 1;
      this._loaded_resolved = false;
      this.on_loaded = new Deferred();
    }

    _folderFor(mode) {
      if (mode === "archived") return "archived";
      if (mode === "starred") return "starred";
      return "all";
    }

    _mapThread(r) {
      var peer = r.peer_xid || "";
      // The node stores the full participant list (JSON) for N-person threads.
      var members = [];
      if (r.members) {
        try {
          members = JSON.parse(r.members) || [];
        } catch (e) {
          members = [];
        }
      }
      if (!members.length && peer) members = [peer];
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

    load(mode, cb) {
      var folder = this._folderFor(mode);
      var gen = this.gen;
      this.loading = true;
      var limit = this.nolimit ? 5000 : this.conv_limit * this.pages;
      Page.channel
        .threads(folder, 0, limit)
        .then((rows) => {
          if (gen !== this.gen) return;
          this.threads = rows.map((r) => this._mapThread(r));
          this.has_more = rows.length >= limit;
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
          this.loading = false;
          if (cb) cb(e);
        });
    }

    // Lazily fill a thread's message list from the node.
    getThread(conv_id) {
      var t = this.threads.filter((x) => x.conv_id === conv_id)[0];
      if (!t) {
        t = {
          key: "conv-" + conv_id,
          conv_id: conv_id,
          members: [],
          subject: "",
          from_xid: "",
          thread_count: 0,
          starred: false,
          folder: "inbox",
          thread_messages: null,
        };
      }
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
      return this.threads.reduce((n, t) => n + (t.unread > 0 ? 1 : 0), 0);
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

    getContacts() {
      Page.channel
        .contacts()
        .then((list) => {
          this._contacts = (list || []).map((c) => c.xid);
          Page.projector.scheduleRender();
        })
        .catch(() => {});
      return this._contacts;
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
