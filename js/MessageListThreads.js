(function() {

  // Thread folder views: inbox, starred, archived, junk. All of them are
  // filters over the same ThreadStore.threads array.
  class MessageListThreads extends MessageList {
    getRows() {
      var threads = Page.thread_store.threads;
      var folder = this.folder;
      if (folder === "starred") {
        // Starred is a virtual folder: starred threads from inbox or archive
        return threads.filter(function(t) {
          return t.starred && t.folder !== "junk";
        });
      }
      return threads.filter(function(t) {
        return t.folder === folder;
      });
    }
  }

  window.MessageListThreads = MessageListThreads;

})();
