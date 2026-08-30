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
          this.publickey = info && info.key_bundle_published ? true : null;
          this.inited = true;
          this._resolveOnce(true);
          if (cb) cb(info);
          Page.projector.scheduleRender();
        })
        .catch((e) => {
          this.inited = true;
          this._resolveOnce(false);
          if (cb) cb(null);
        });
    }

    // Publish this identity's key bundle (onboarding). cb(ok).
    publishKeyBundle(cb) {
      Page.channel
        .publishKeyBundle()
        .then(() => {
          this.publickey = true;
          Page.projector.scheduleRender();
          if (cb) cb(true);
        })
        .catch((e) => {
          Page.cmd("wrapperNotification", [
            "error",
            _("Could not publish your channel keys: ") + (e && e.message),
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
