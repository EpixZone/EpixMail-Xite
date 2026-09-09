// User.js — identity + send, now a thin layer over the node's channel API.
//
// The old User held the mailbox (data.json, per-conversation ECIES ciphertext,
// prekeys, quota) and did all the crypto in the page. That is gone: the node
// owns the private index and the crypto engine (js/Channel.js → channel* WS
// commands). What remains here is the identity accessors the UI reads and thin
// wrappers that forward send / key-publish / delete to the node. No key or
// ciphertext ever touches the page.
(function () {
  "use strict";

  class User {
    constructor() {
      this.data = {}; // kept for callers that read Page.user.data
      this.publickey = null; // truthy once this identity's key bundle is published
      this.my_xid = null;
      this.my_user_dir = null;
      this.session = null; // last channelSessionInfo
      this.inited = false;
      this.loading = false;
      this._resolved = false;
      this.loaded = new Deferred();
      this.loaded.then((res) => {
        this.loading = false;
        this.inited = true;
        Page.projector.scheduleRender();
      });
    }

    getInnerPath(file_name) {
      if (!file_name) file_name = "data.json";
      var dir =
        this.my_user_dir || Page.site_info.xid_directory || Page.site_info.auth_address;
      return "data/users/" + dir + "/" + file_name;
    }

    // The bare xID name (no TLD) this xite currently acts as, from the node's
    // session when it has answered, else from siteInfo. Cleared on every
    // identity switch (`resetIdentity`), never cached across one.
    getMyXid() {
      if (this.my_xid) return this.my_xid;
      var identity = this.session && this.session.identity;
      if (identity && identity.xid) {
        this.my_xid = identity.xid.replace(/\.epix$/, "");
        return this.my_xid;
      }
      var cert = Page.site_info && Page.site_info.cert_user_id;
      if (cert) {
        this.my_xid = cert.replace(/@.*/, "");
        return this.my_xid;
      }
      return null;
    }

    // Whether the identity's channel setup is still in flight (keys derived or
    // publishing) rather than done or failed.
    setupPending() {
      var setup = this.session && this.session.identity && this.session.identity.setup;
      return !!setup && (setup.state === "pending" || setup.state === "keys");
    }

    setupError() {
      var setup = this.session && this.session.identity && this.session.identity.setup;
      return setup && setup.state === "failed" ? (setup.error || _("Setup failed")) : null;
    }

    // Forget everything tied to the previous identity (an account switch).
    resetIdentity() {
      this.my_xid = null;
      this.my_user_dir = null;
      this.session = null;
      this.publickey = null;
      this.inited = false;
      if (this._setup_poll) { clearTimeout(this._setup_poll); this._setup_poll = null; }
    }

    getMyXidDir() {
      return (
        this.my_user_dir ||
        (Page.site_info && (Page.site_info.xid_directory || Page.site_info.auth_address))
      );
    }

    _resolveOnce(v) {
      if (!this._resolved) {
        this._resolved = true;
        this.loaded.resolve(v);
      }
    }

    // Called after siteInfo: pull channel session state from the node.
    onSiteInfo(site_info, cb) {
      if (site_info) this.my_user_dir = site_info.xid_directory;
      Page.channel
        .sessionInfo()
        .then((info) => {
          this.session = info;
          this.my_xid = null;
          var setup = info && info.identity && info.identity.setup;
          this.publickey =
            (setup && setup.state === "published") || (info && info.key_bundle_published)
              ? true
              : null;
          this.inited = true;
          this._resolveOnce(true);
          // While the node is still publishing this identity's keys into the
          // hub, poll so the banner flips to the inbox the moment it lands.
          if (this.setupPending() && !this._setup_poll) {
            this._setup_poll = setTimeout(() => {
              this._setup_poll = null;
              this.onSiteInfo(null);
            }, 3000);
          }
          // While messages sit in the durable outbox, poll so the "queued
          // for delivery" indicator drains promptly even when delivery
          // happens with no accompanying site event.
          if (info && info.outbox_pending > 0 && !this._outbox_poll) {
            this._outbox_poll = setTimeout(() => {
              this._outbox_poll = null;
              this.onSiteInfo(null);
            }, 20000);
          }
          if (cb) cb(info);
          Page.projector.scheduleRender();
        })
        .catch((e) => {
          this.inited = true;
          this._resolveOnce(false);
          if (cb) cb(null);
        });
    }

    // Ask the node to (re)run this identity's channel setup, then refresh the
    // session so the banner shows its progress. cb(ok).
    publishKeyBundle(cb) {
      Page.channel
        .identitySetup()
        .then(() => {
          this.onSiteInfo(null, () => {
            if (cb) cb(true);
          });
        })
        .catch((e) => {
          Page.cmd("wrapperNotification", [
            "error",
            _("Could not set up your channel keys: ") + (e && e.message),
          ]);
          if (cb) cb(false);
        });
    }

    // Back-compat alias used by StartScreen.
    createData(cb) {
      this.publishKeyBundle(cb);
    }

    // Send a message via the node. recipients: array of xIDs (or one string).
    // conv_id (hex) reuses an existing thread for a reply, else null = new.
    sendMessage(recipients, subject, body, conv_id, cb) {
      if (typeof recipients === "string") recipients = [recipients];
      Page.channel
        .send(recipients, subject, body, conv_id)
        .then((res) => {
          if (cb) cb(res);
        })
        .catch((e) => {
          Page.cmd("wrapperNotification", ["error", e && e.message]);
          if (cb) cb(false, e);
        });
    }

    deleteMessage(conv_id, cb) {
      Page.channel
        .deleteLocal(conv_id)
        .then(() => cb && cb(true))
        .catch(() => cb && cb(false));
    }

    formatQuota() {
      return "";
    }
  }

  Object.assign(User.prototype, LogMixin);
  window.User = User;
})();
