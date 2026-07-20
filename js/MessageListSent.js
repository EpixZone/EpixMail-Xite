(function() {

  // Sent: a flat list of my own messages (per-message rows, immutable keys).
  class MessageListSent extends MessageList {
    getRows() {
      return Page.thread_store.sent_rows;
    }

    // Deleting a sent message signs a tombstone into my messages.json (the CRDT
    // fold hides it everywhere and it propagates to my other devices), and also
    // drops any not-yet-migrated legacy copy from data.json. A local tombstone
    // gives an immediate hide on this device (covers a legacy copy still being
    // read) before the reload.
    deleteMessage(message) {
      var row = message.row;
      Page.user.deleteMessage(row.conv_id, row.seq, row.date_added, function(ok) {
        Page.thread_store.deleteThread({thread_messages: [row]});
        Page.thread_store.invalidate();
        Page.thread_store.load("noanim");
      });
    }
  }

  window.MessageListSent = MessageListSent;

})();
