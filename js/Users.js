(function() {

  class Users {
    constructor() {
      this.user_address = {};
    }

    getUsernames(directories, cb) {
      if (!directories || directories.length === 0) return cb({});
      var query = "SELECT directory, value AS cert_user_id FROM json LEFT JOIN keyvalue USING (json_id) WHERE ? AND file_name = 'content.json' AND key = 'cert_user_id'";
      Page.cmd("dbQuery", [query, {directory: directories}], (rows) => {
        var usernames = {};
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          usernames[row.directory] = row.cert_user_id;
          var xid_name = row.cert_user_id.replace(/@.*/, "");
          this.user_address[xid_name] = row.directory;
          this.user_address[row.cert_user_id] = row.directory;
        }
        cb(usernames);
      });
    }

    getAddress(xid_names, cb) {
      var unknown = xid_names.filter((name) => this.user_address[name] == null);
      if (unknown.length === 0) {
        cb(this.user_address);
        return;
      }
      var query = "SELECT value, directory FROM keyvalue LEFT JOIN json USING (json_id) WHERE ?";
      Page.cmd("dbQuery", [query, {"key": "cert_user_id", "value": unknown}], (rows) => {
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var xid_name = row.value.replace(/@.*/, "");
          this.user_address[row.value] = row.directory;
          this.user_address[xid_name] = row.directory;
        }
        cb(this.user_address);
      });
    }

    getAll(cb) {
      Page.cmd("dbQuery", ["SELECT value, directory FROM keyvalue LEFT JOIN json USING (json_id) WHERE key = 'cert_user_id'"], (rows) => {
        if (rows.error) return false;
        this.user_address = {};
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var xid_name = row.value.replace(/@.*/, "");
          this.user_address[xid_name] = row.directory;
          this.user_address[row.value] = row.directory;
        }
        cb(this.user_address);
      });
    }
  }

  Object.assign(Users.prototype, LogMixin);
  window.Users = Users;

})();
