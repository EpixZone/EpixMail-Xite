// Channel.js — the client API for metadata-private Epix Mail.
//
// This is the ENTIRE data layer of Epix Mail. All message crypto,
// trial-decryption, indexing and search live in the EpixNet node; the page
// only calls these thin wrappers over the node's `channel*` WebSocket commands
// and never sees a key, a ciphertext, or another user's metadata.
//
// Identity: the node holds any number of linked xIDs and each has its own
// inbox. Every command acts as the identity this xite currently uses (the
// account menu switches it with `identitySelect`), so nothing here names one.
// Key bundles are published by the node itself into the channel hub (the xID
// xite) as part of linking an identity; the page only reports setup state.
//
// Every method returns a Promise. `Page` is the EpixFrame instance (window.Page)
// whose `cmd(name, params, cb)` speaks to the node.
(function () {
  "use strict";

  function normXid(x) {
    x = (x || "").trim().replace(/\.+$/, "");
    return x.endsWith(".epix") ? x : x + ".epix";
  }

  class Channel {
    constructor(page) {
      this.page = page;
      this.session = null; // last mailSessionInfo result
    }

    // Promise wrapper over Page.cmd. Node handlers return either a plain value
    // or `{error: "..."}`; reject on error strings.
    _cmd(name, params) {
      return new Promise((resolve, reject) => {
        this.page.cmd(name, params || [], (res) => {
          if (res && typeof res === "object" && res.error) reject(new Error(res.error));
          else resolve(res);
        });
      });
    }

    // --- identity / onboarding -------------------------------------------

    // {enabled, xite, hub_ready, identity: null | {auth, xid, enabled,
    //  setup: {state, error, attempts, next_retry_ms, published_path,
    //  published_peers}, key_bundle_published, unread, outbox_pending,
    //  outbox_error}, identities: [{auth, xid, enabled, state, unread}]}.
    // `identity` is null while this xite browses anonymously.
    async sessionInfo() {
      // Mail reads the mail app only; other xites carry their own apps.
      this.session = await this._cmd("channelSessionInfo", [{ app: "mail" }]);
      return this.session;
    }

    // (Re)run the node-side setup for the identity this xite acts as: derive
    // its channel keys and publish its bundle into the hub. Resolves with the
    // setup object; the worker keeps retrying on its own while `pending`.
    identitySetup(auth) {
      return this._cmd("channelIdentitySetup", auth ? [{ auth_address: auth }] : []);
    }

    // Turn channels on or off for one held identity (off = not indexed, not
    // badged, not published again).
    identitySetEnabled(auth, enabled) {
      return this._cmd("channelIdentitySetEnabled", [auth, !!enabled]);
    }

    // The Config page's status object for the identity this xite acts as.
    identityStatus(auth) {
      return this._cmd("channelIdentityStatus", auth ? [{ auth_address: auth }] : []);
    }

    // Legacy name: the node publishes the bundle itself now.
    publishKeyBundle() {
      return this.identitySetup();
    }

    // {"<xid>": {has_bundle: bool}} — whether each recipient can receive mail.
    // A purely local read of already-synced data.json; leaks nothing.
    keyLookup(xids) {
      return this._cmd("channelKeyLookup", [xids.map(normXid)]);
    }

    // --- reading ---------------------------------------------------------

    // {threads: [...]} newest-first. folder ∈ all|starred|archived.
    threads(folder, offset, limit) {
      return this._cmd("channelThreads", [
        { folder: folder || "all", offset: offset || 0, limit: limit || 50, app: "mail" },
      ]).then((r) => (r && r.threads) || []);
    }

    // {messages: [...]} oldest-first for one conversation.
    conversation(convId) {
      return this._cmd("channelConversation", [{ conv_id: convId }]).then(
        (r) => (r && r.messages) || []
      );
    }

    // Full-text search over the local decrypted index.
    search(query, limit) {
      return this._cmd("channelSearch", [query, limit || 100, { app: "mail" }]).then(
        (r) => (r && r.results) || []
      );
    }

    contacts() {
      return this._cmd("channelContacts");
    }

    // --- writing ---------------------------------------------------------

    // Seal + post a message. `recipients` is an array of xIDs; `convId` (hex)
    // reuses an existing thread for a reply, else omit for a new conversation.
    send(recipients, subject, body, convId) {
      const params = [recipients.map(normXid), subject || "", body || ""];
      if (convId) params.push(convId);
      return this._cmd("channelSend", params);
    }

    markRead(convId, read) {
      return this._cmd("channelMarkRead", [convId, read !== false]);
    }

    // Persist per-device conversation flags (star / archive). Pass only the
    // flags you're changing, e.g. setConvState(id, {starred:true}).
    setConvState(convId, state) {
      return this._cmd("channelSetConvState", [convId, state || {}]);
    }

    deleteLocal(convId) {
      return this._cmd("channelDeleteLocal", [convId]);
    }

    // One-shot import of legacy (pre-cutover) mail into the private index.
    migrateLegacy() {
      return this._cmd("channelMigrateLegacy");
    }

    // --- live events -----------------------------------------------------

    // The node pushes {cmd:"channelEvent", params:{type, identity_id, xid,
    // auth, app, conv_id, from_xid, subject, snippet, unread}} on new mail,
    // {type:"setup", xid, state} when an identity's keys land in the hub, and
    // {type:"migrated", imported} after a legacy import. Events are routed to
    // this xite only for the identity it currently acts as.
    static isEvent(cmd) {
      return cmd === "channelEvent";
    }
  }

  window.Channel = Channel;
})();
