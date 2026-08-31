(function() {

  // Client-side search over the decrypted thread cache. Mail is end-to-end
  // encrypted, so only messages that are downloaded and decrypted this
  // session can match; the hint under the field says so.
  class SearchBar {
    constructor(message_lists) {
      this.message_lists = message_lists;
      this.handleInput = this.handleInput.bind(this);
      this.handleClearClick = this.handleClearClick.bind(this);
    }

    handleInput(e) {
      var value = e.target.value;
      this.message_lists.search_query = value;
      if (value && !Page.thread_store.nolimit) {
        // Search the whole mailbox, not just the first page of threads
        Page.thread_store.nolimit = true;
        Page.thread_store.invalidate();
        Page.thread_store.load("noanim");
      }
      Page.projector.scheduleRender();
    }

    handleClearClick() {
      this.message_lists.search_query = "";
      Page.projector.scheduleRender();
      return false;
    }

    render() {
      var query = this.message_lists.search_query;
      return h("div.SearchBar", [
        h("div.search-field", [
          h("span.icon.icon-search"),
          h("input.search", {
            type: "text",
            placeholder: _("Search mail"),
            autocomplete: "off",
            value: query,
            oninput: this.handleInput
          }),
          query ? h("a.icon.icon-close.search-clear", {
            href: "#Clear",
            title: _("Clear search"),
            onclick: this.handleClearClick
          }) : null
        ]),
        query ? h("div.search-hint", _("Only downloaded messages are searched")) : null
      ]);
    }
  }

  window.SearchBar = SearchBar;

})();
