(function() {

  // Substring matcher over decrypted thread rows: subject, body and
  // participant names of every message in the thread. Linear scan is fine at
  // mailbox scale (everything is already decrypted in memory).
  class SearchIndex {
    static matches(row, query) {
      var q = (query || "").toLowerCase().trim();
      if (!q) return true;
      if ((row.subject || "").toLowerCase().indexOf(q) !== -1) return true;
      if ((row.body || "").toLowerCase().indexOf(q) !== -1) return true;
      var members = row.members || [];
      for (var i = 0; i < members.length; i++) {
        if (members[i].toLowerCase().indexOf(q) !== -1) return true;
      }
      var msgs = row.thread_messages || [];
      for (var mi = 0; mi < msgs.length; mi++) {
        var msg = msgs[mi];
        if ((msg.subject || "").toLowerCase().indexOf(q) !== -1) return true;
        if ((msg.body || "").toLowerCase().indexOf(q) !== -1) return true;
        if ((msg.from_xid || "").toLowerCase().indexOf(q) !== -1) return true;
      }
      return false;
    }
  }

  window.SearchIndex = SearchIndex;

})();
