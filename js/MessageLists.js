(function() {

  class MessageLists {
    constructor() {
      // Titles stay untranslated here; consumers wrap them in _() at render
      // time (the language file loads after construction)
      this.inbox = new MessageListThreads(this, "inbox", "Inbox");
      this.starred = new MessageListThreads(this, "starred", "Starred");
      this.archived = new MessageListThreads(this, "archived", "Archived");
      this.junk = new MessageListThreads(this, "junk", "Junk");
      this.sent = new MessageListSent(this, "sent", "Sent");
      this.active = this.inbox;
      this.search_query = "";
      this.search_bar = new SearchBar(this);
    }

    setActive(name) {
      this.active = this[name] || this.inbox;
      Page.thread_store.load();
      Page.projector.scheduleRender();
      return this.active;
    }

    render() {
      return h("div.MessageLists", [
        this.search_bar.render(),
        this.active.render()
      ]);
    }
  }

  Object.assign(MessageLists.prototype, LogMixin);
  window.MessageLists = MessageLists;

})();
