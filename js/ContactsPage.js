(function() {

  // Everyone you share a conversation with, as a card grid with a per-person
  // Message button and a spam toggle.
  class ContactsPage {
    constructor() {
      this.filter = "";
      this.handleFilterInput = this.handleFilterInput.bind(this);
      this.handleMessageClick = this.handleMessageClick.bind(this);
      this.handleJunkClick = this.handleJunkClick.bind(this);
      this.renderCard = this.renderCard.bind(this);
    }

    update() {
      Page.thread_store.load();
    }

    displayXid(name) {
      return name ? name.replace(/\.[^.]+$/, "") : name;
    }

    handleFilterInput(e) {
      this.filter = e.target.value;
      Page.projector.scheduleRender();
      return false;
    }

    handleMessageClick(e) {
      var name = e.currentTarget.attributes["data-name"].value;
      Page.message_create.show(name);
      return false;
    }

    handleJunkClick(e) {
      var xid = e.currentTarget.attributes["data-xid"].value;
      Page.thread_store.setJunkSender(xid, !Page.thread_store.isJunkSender(xid));
      return false;
    }

    renderCard(xid) {
      var name = this.displayXid(xid);
      var profile = Page.xid_profiles[xid] || {};
      var junked = Page.thread_store.isJunkSender(xid);
      return h("div.contact.card", {key: xid, classes: {junked: junked}}, [
        Page.renderXidAvatar(xid),
        h("div.contact-name", xid),
        profile.bio ? h("div.contact-bio", profile.bio) : null,
        h("div.contact-actions", [
          h("a.button.button-submit.button-message", {
            href: "#Message",
            "data-name": name,
            onclick: this.handleMessageClick
          }, [h("span.icon.icon-compose"), _("Message")]),
          h("a.link.junk-toggle", {
            href: "#Junk",
            "data-xid": xid,
            classes: {active: junked},
            onclick: this.handleJunkClick
          }, junked ? _("Not spam") : _("Mark as spam"))
        ])
      ]);
    }

    render() {
      var contacts = Page.thread_store.getContacts();
      var filter = this.filter.toLowerCase().trim();
      if (filter) {
        contacts = contacts.filter(function(xid) {
          return xid.toLowerCase().indexOf(filter) !== -1;
        });
      }
      return h("div.ContactsPage", [
        h("div.contacts-head", [
          h("h1.page-title", _("Contacts")),
          h("div.search-field", [
            h("span.icon.icon-search"),
            h("input.search", {
              type: "text",
              placeholder: _("Filter contacts"),
              value: this.filter,
              oninput: this.handleFilterInput
            })
          ])
        ]),
        contacts.length > 0
          ? h("div.contacts-grid", contacts.map(this.renderCard))
          : h("div.list-empty", [
              h("span.icon.icon-users.empty-icon"),
              h("div.empty-title", this.filter ? _("No matching contacts") : _("People you message will appear here"))
            ])
      ]);
    }
  }

  Object.assign(ContactsPage.prototype, LogMixin);
  window.ContactsPage = ContactsPage;

})();
