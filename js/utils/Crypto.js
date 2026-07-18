(function() {

  class Crypto {
    // Ensure xID has .epix TLD for consistent comparison
    static normalizeXid(name) {
      if (!name) return name;
      return name.match(/\.epix$/i) ? name : name + ".epix";
    }

    // Generate a random conversation ID
    static generateConversationId() {
      var arr = new Uint8Array(32);
      crypto.getRandomValues(arr);
      return Array.from(arr).map(function(b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
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
            // The node returns command failures as a truthy {error: ...}
            // object, so require a real string before storing it - a bad
            // pubkey must not silently become an unreadable ciphertext.
            if (typeof ciphertext === "string" && ciphertext) {
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
      Crypto.resolveMemberPubkeys([xid_name], function(pubkeys, missing) {
        if (missing.length > 0) {
          return cb({}, missing[0].reason);
        }
        cb(pubkeys, null);
      });
    }

    // Resolve encryption pubkeys for a list of xID names. Local files only
    // (required: false): a member whose data.json hasn't synced yet reports
    // as missing, which is the right compose-time answer.
    // cb(pubkeys_by_xid, missing) where missing = [{xid, reason}, ...]
    static resolveMemberPubkeys(xids, cb) {
      if (!xids || xids.length === 0) return cb({}, []);
      var pubkeys = {};
      var missing = [];
      var remaining = xids.length;
      for (var i = 0; i < xids.length; i++) {
        (function(xid) {
          var inner_path = "data/users/" + xid + "/data.json";
          Page.cmd("fileGet", {"inner_path": inner_path, "required": false}, function(data) {
            if (!data) {
              missing.push({xid: xid, reason: xid + " hasn't set up Epix Mail yet"});
            } else {
              var parsed = null;
              try {
                parsed = JSON.parse(data);
              } catch (e) {
                parsed = null;
              }
              if (!parsed) {
                missing.push({xid: xid, reason: "Could not read encryption keys for " + xid});
              } else if (!parsed.publickey) {
                missing.push({xid: xid, reason: xid + " hasn't generated encryption keys yet"});
              } else {
                pubkeys[xid] = parsed.publickey;
              }
            }
            remaining--;
            if (remaining === 0) cb(pubkeys, missing);
          });
        })(xids[i]);
      }
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
