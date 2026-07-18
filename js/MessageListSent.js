(function() {

  // Sent: a flat list of my own messages (per-message rows, immutable keys).
  class MessageListSent extends MessageList {
    getRows() {
      return Page.thread_store.sent_rows;
    }

    // Deleting a sent message removes it from my own signed data.json (the
    // one copy I control), then republishes.
    deleteMessage(message) {
      var row = message.row;
      var convs = Page.user.data && Page.user.data.conversations;
      var conv = convs && convs[row.conv_id];
      if (conv && conv.messages && conv.messages[String(row.date_added)]) {
        delete conv.messages[String(row.date_added)];
        if (Object.keys(conv.messages).length === 0) {
          delete convs[row.conv_id];
        }
        Page.user.saveData().then(function() {
          Page.thread_store.invalidate();
          Page.thread_store.load("noanim");
        });
      } else {
        // Not in my file (already gone): fall back to a local tombstone
        Page.thread_store.deleteThread({thread_messages: [row]});
      }
    }
  }

  window.MessageListSent = MessageListSent;

})();
