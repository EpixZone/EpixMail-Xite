(function() {

  class Crypto {
    // Generate deterministic conversation ID from two xID names
    static getConversationId(xid_a, xid_b, cb) {
      var sorted = [xid_a, xid_b].sort();
      var data = sorted.join(":");
      var encoder = new TextEncoder();
      crypto.subtle.digest("SHA-256", encoder.encode(data)).then(function(hash) {
        var hex = Array.from(new Uint8Array(hash)).map(function(b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
        cb(hex);
      });
    }

    // Encrypt plaintext for multiple recipients
    static encryptForAll(plaintext, pubkeys_by_xid, cb) {
      var xids = Object.keys(pubkeys_by_xid);
      if (xids.length === 0) return cb({});
      var ct = {};
      var remaining = xids.length;
      for (var i = 0; i < xids.length; i++) {
        (function(xid) {
          var pubkey = pubkeys_by_xid[xid];
          Page.cmd("eciesEncrypt", [plaintext, pubkey], function(ciphertext) {
            if (ciphertext) {
              ct[xid] = ciphertext;
            }
            remaining--;
            if (remaining === 0) {
              cb(ct);
            }
          });
        })(xids[i]);
      }
    }

    // Decrypt message — find own ciphertext in ct dict
    static decryptMessage(ct_dict, cb) {
      var my_xid_dir = Page.site_info.xid_directory || Page.site_info.auth_address;
      var my_ct = ct_dict[my_xid_dir];
      if (!my_ct) return cb(null);
      Page.cmd("eciesDecrypt", [my_ct], function(plaintext) {
        cb(plaintext);
      });
    }

    // Sign message data for sender authentication
    static signMessage(data, cb) {
      Page.cmd("ecdsaSign", [data], function(sig) {
        cb(sig);
      });
    }

    // Verify sender signature
    static verifyMessage(data, address, signature, cb) {
      Page.cmd("ecdsaVerify", [data, address, signature], function(valid) {
        cb(valid);
      });
    }

    // Get address from publickey
    static pubkeyToAddress(pubkey, cb) {
      Page.cmd("eccPubToAddr", [pubkey], function(address) {
        cb(address);
      });
    }

    // Convert base64 string to hex string
    static base64ToHex(b64) {
      var raw = atob(b64);
      var hex = [];
      for (var i = 0; i < raw.length; i++) {
        hex.push(raw.charCodeAt(i).toString(16).padStart(2, "0"));
      }
      return hex.join("");
    }

    // Resolve encryption pubkey for an xID name from their Mail site data.json
    // User directories on Mail are named by xID (e.g. data/users/mud.epix/data.json)
    static resolveAllPubkeys(xid_name, cb) {
      var inner_path = "data/users/" + xid_name + "/data.json";
      Page.cmd("fileGet", {"inner_path": inner_path, "required": false}, function(data) {
        if (!data) {
          return cb({}, xid_name + " hasn't set up Epix Mail yet");
        }
        try {
          var parsed = JSON.parse(data);
        } catch (e) {
          return cb({}, "Could not read encryption keys for " + xid_name);
        }
        var pubkey = parsed && parsed.publickey;
        if (!pubkey) {
          return cb({}, xid_name + " hasn't generated encryption keys yet");
        }
        var result = {};
        result[xid_name] = pubkey;
        cb(result, null);
      });
    }

    // Find a user's publickey from their directory on the Mail site
    static getUserPubkey(user_directory, cb) {
      var inner_path = "data/users/" + user_directory + "/data.json";
      Page.cmd("fileGet", {"inner_path": inner_path, "required": false}, function(data) {
        if (data) {
          try {
            var parsed = JSON.parse(data);
            return cb((parsed && parsed.publickey) || null);
          } catch (e) {
            return cb(null);
          }
        }
        cb(null);
      });
    }

    // Sign a prekey with the identity key
    static signPrekey(prekey, cb) {
      Page.cmd("ecdsaSign", [prekey], function(sig) {
        cb(sig);
      });
    }

    // Verify a prekey signature
    static verifyPrekey(prekey, address, signature, cb) {
      Page.cmd("ecdsaVerify", [prekey, address, signature], function(valid) {
        cb(valid);
      });
    }
  }

  window.Crypto = Crypto;

})();
