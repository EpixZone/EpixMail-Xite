// Channel.js — the client API for metadata-private Epix Mail.
//
// This is the ENTIRE data layer of the new Epix Mail. All message crypto,
// trial-decryption, indexing and search now live in the EpixNet node; the page
// only calls these thin wrappers over the node's `mail*` WebSocket commands and
// never sees a key, a ciphertext, or another user's metadata. It replaces the
// old js/utils/Crypto.js (eciesEncrypt/eciesDecrypt), the messages.json
// read/write path in User.js, and the plaintext dbQuery discovery in
// ThreadStore.js.
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

    // {enabled, xite, key_bundle_published, unread}
    async sessionInfo() {
      this.session = await this._cmd("channelSessionInfo");
      return this.session;
    }

    // Publish this identity's key bundle. The node returns
    // {xid, auth, primary_path, device_path, bundle}. A name may have several
    // linked devices, so devices must not clobber a single file: this device
    // takes the PRIMARY `data.json` slot when it is free or already ours (which
    // keeps single-device users readable by nodes that only look at data.json),
    // and its per-device `data-<auth>.json` slot only when a DIFFERENT device
    // already holds the primary. Returns the written inner_path.
    async publishKeyBundle() {
      const res = await this._cmd("channelKeyBundlePublish");
      let inner = res.primary_path;
      try {
        const cur = await this._cmd("fileGet", [res.primary_path]);
        if (cur) {
          const held = JSON.parse(cur);
          // Someone else's device owns data.json → claim our own slot.
          if (held && held.auth && held.auth !== res.auth) {
            inner = res.device_path;
          }
        }
      } catch (e) {
        /* no primary file yet — take it */
      }
      await this._cmd("fileWrite", [inner, btoa(JSON.stringify(res.bundle))]);
      // Object form, NOT positional: sitePublish's positional order is
      // (privatekey, inner_path, sign), so `[inner]` would be read as a
      // private key and the root content.json signed instead.
      await this._cmd("sitePublish", { inner_path: inner });
      return inner;
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
        { folder: folder || "all", offset: offset || 0, limit: limit || 50 },
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
      return this._cmd("channelSearch", [query, limit || 100]).then(
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

    // The node pushes {cmd:"channelEvent", params:{type, conv_id, from_xid,
    // subject, snippet, unread}} on new mail / scan progress. Call this from the
    // app's onRequest handler; `handler` receives the params object.
    static isEvent(cmd) {
      return cmd === "channelEvent";
    }
  }

  window.Channel = Channel;
})();
