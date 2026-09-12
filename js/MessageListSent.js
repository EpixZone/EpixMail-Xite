(function() {

  // Sent: a flat list of my own messages (per-message rows, immutable keys).
  class MessageListSent extends MessageList {
    getRows() {
      return Page.thread_store.sent_rows;
    }

    // The private index has no per-message delete: a sent row's trash removes
    // the whole conversation from this device (the sealed pool records are
    // untouched), exactly like the trash on a thread row. Drop every sent row
    // of that conversation from the view at once.
    deleteMessage(message) {
      var row = message.row;
      Page.thread_store.sent_rows = Page.thread_store.sent_rows.filter(
        (r) => r.conv_id !== row.conv_id
      );
      Page.thread_store.deleteThread({conv_id: row.conv_id});
    }
  }

  window.MessageListSent = MessageListSent;

})();
