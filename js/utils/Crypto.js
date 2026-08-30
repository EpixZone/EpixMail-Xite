// Crypto.js — now a thin xID helper only.
//
// All real cryptography (key agreement, sealing, trial-decryption) moved into
// the EpixNet node behind the `channel*` WebSocket commands (see js/Channel.js);
// the page never holds a key or a ciphertext. The single pure helper the UI
// still needs — xID normalization — stays here under the familiar `Crypto.`
// name so the ~27 call sites keep working unchanged.
(function () {
  "use strict";

  var Crypto = {
    // "alice" / "alice." / "alice.epix" -> "alice.epix"
    normalizeXid: function (xid) {
      if (!xid) return xid;
      xid = String(xid).trim().replace(/\.+$/, "");
      return xid.endsWith(".epix") ? xid : xid + ".epix";
    },
  };

  window.Crypto = Crypto;
})();
