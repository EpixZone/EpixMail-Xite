(function() {

  // Generic folder view: renders rows from ThreadStore through a full
  // reconcile keyed by the row's stable key. Rebuilding from the incoming
  // rows and dropping stale keys is what prevents the old duplicate-thread
  // bug (the previous sync never removed rows whose key disappeared).
  class MessageList {
    constructor(message_lists, folder, title) {
      this.message_lists = message_lists;
      this.folder = folder;
      this.title = title;
      this.messages = [];
      this.message_db = {};
      this.handleMoreClick = this.handleMoreClick.bind(this);
      this.handleClearSearchClick = this.handleClearSearchClick.bind(this);
      this.handleComposeClick = this.handleComposeClick.bind(this);
    }

    // Override: the source rows for this folder
    getRows() {
      return [];
    }

    applySearch(rows) {
      var query = this.message_lists.search_query;
      if (!query) return rows;
      return rows.filter(function(row) {
        return SearchIndex.matches(row, query);
      });
    }

    syncMessages(rows) {
      this.messages.splice(0, this.messages.length);
      var seen = {};
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var obj = this.message_db[row.key];
        if (obj) {
          obj.row = row;
        } else {
          obj = new Message(this, row);
          this.message_db[row.key] = obj;
        }
        obj.read = obj.isThreadRead();
        this.messages.push(obj);
        seen[row.key] = true;
      }
      for (var key in this.message_db) {
        if (!seen[key]) delete this.message_db[key];
      }
    }

    deleteMessage(message) {
      Page.thread_store.deleteThread(message.row);
    }

    handleMoreClick() {
      var store = Page.thread_store;
      store.nolimit = true;
      store.invalidate();
      store.load("noanim");
      return false;
    }

    handleClearSearchClick() {
      this.message_lists.search_query = "";
      Page.projector.scheduleRender();
      return false;
    }

    handleComposeClick() {
      Page.message_create.show();
      return false;
    }

    getEmptyText() {
      if (this.folder === "starred") return _("Star a conversation and it shows up here");
      if (this.folder === "archived") return _("Archived conversations live here");
      if (this.folder === "junk") return _("Nothing here. Marking a sender as spam moves their mail here.");
      if (this.folder === "sent") return _("Messages you send appear here");
      return _("No conversations yet");
    }

    renderEmpty() {
      var query = this.message_lists.search_query;
      if (query) {
        return h("div.list-empty", {key: "empty-search"}, [
          h("span.icon.icon-search.empty-icon"),
          h("div.empty-title", _("No results for") + " “" + query + "”"),
          h("a.link", {href: "#Clear", onclick: this.handleClearSearchClick}, _("Clear search"))
        ]);
      }
      var is_inbox = this.folder === "inbox";
      return h("div.list-empty", {key: "empty-" + this.folder}, [
        h("span.icon.empty-icon", {classes: this.getEmptyIconClasses()}),
        h("div.empty-title", this.getEmptyText()),
        is_inbox ? h("a.button.button-submit", {href: "#Compose", onclick: this.handleComposeClick}, _("Send your first message")) : null
      ]);
    }

    getEmptyIconClasses() {
      var classes = {};
      if (this.folder === "starred") classes["icon-star"] = true;
      else if (this.folder === "archived") classes["icon-archive"] = true;
      else if (this.folder === "junk") classes["icon-junk"] = true;
      else if (this.folder === "sent") classes["icon-sent"] = true;
      else classes["icon-inbox"] = true;
      return classes;
    }

    render() {
      var store = Page.thread_store;
      var rows = this.applySearch(this.getRows());
      this.syncMessages(rows);
      if (this.messages.length > 0) {
        return h("div.MessageList", {key: this.folder},
          this.messages.map(function(message) {
            return message.renderList();
          }).concat([
            h("a.more", {
              href: "#More",
              classes: {visible: store.has_more, loading: store.loading},
              onclick: this.handleMoreClick
            }, _("Load more"))
          ])
        );
      }
      if (store.loading && !store.loaded) {
        return h("div.MessageList", {key: this.folder}, [
          h("div.list-empty.loading", [
            h("span.spinner"),
            h("div.empty-title", _("Decrypting your mailbox..."))
          ])
        ]);
      }
      return h("div.MessageList", {key: this.folder}, [this.renderEmpty()]);
    }
  }

  Object.assign(MessageList.prototype, LogMixin);
  window.MessageList = MessageList;

})();
