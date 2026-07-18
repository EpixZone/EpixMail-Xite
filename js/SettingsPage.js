(function() {

  // Settings (?Settings): the notification opt-out. The master toggle silences
  // every external alert (dashboard, nav icon, tray, pop-ups); the sub-toggle
  // controls only the OS/browser pop-up. Both persist in the private mail
  // settings, so they follow the account across devices.
  class SettingsPage {
    constructor() {
      this.handleToggleNotifications = this.handleToggleNotifications.bind(this);
      this.handleToggleDesktop = this.handleToggleDesktop.bind(this);
      this.renderToggle = this.renderToggle.bind(this);
    }

    update() {
      Page.projector.scheduleRender();
    }

    get(key, def) {
      var ls = Page.local_storage;
      if (!ls || ls[key] === undefined) return def;
      return ls[key];
    }

    handleToggleNotifications() {
      if (!Page.local_storage) return false;
      Page.local_storage.notifications = !this.get("notifications", true);
      // Writes the new baseline: silences or restores the external count
      Page.saveLocalStorage();
      Page.projector.scheduleRender();
      return false;
    }

    handleToggleDesktop() {
      if (!Page.local_storage) return false;
      // Disabled while the master toggle is off (the row is greyed out).
      if (Page.local_storage.notifications === false) return false;
      var on = !this.get("desktop_notifications", true);
      Page.local_storage.desktop_notifications = on;
      Page.saveLocalStorage();
      // Turning pop-ups on triggers the browser permission prompt and confirms
      if (on) {
        Page.fireWebNotification(_("Notifications on"), _("You'll be notified when new mail arrives."), null);
      }
      Page.projector.scheduleRender();
      return false;
    }

    // handler must be a stable bound function (maquette forbids changing an
    // event handler's identity between renders). The disabled state is handled
    // by CSS (pointer-events) and a guard inside the handler, never by swapping
    // the onclick.
    renderToggle(on, label, desc, handler, disabled) {
      return h("div.setting-row", {classes: {disabled: !!disabled}}, [
        h("div.setting-text", [
          h("div.setting-label", label),
          desc ? h("div.setting-desc", desc) : null
        ]),
        h("a.toggle", {
          href: "#Toggle",
          title: label,
          classes: {on: on, disabled: !!disabled},
          onclick: handler
        }, h("span.toggle-knob"))
      ]);
    }

    render() {
      var notif_on = this.get("notifications", true);
      var desktop_on = this.get("desktop_notifications", true);
      var perm = (typeof Notification !== "undefined" && Notification.permission) || "default";
      return h("div.SettingsPage", [
        h("h1.page-title", _("Settings")),
        h("section.settings-section", [
          h("h2.settings-heading", _("Notifications")),
          this.renderToggle(
            notif_on,
            _("New-mail notifications"),
            _("Alert me on the dashboard, the nav icon and the tray when new mail arrives."),
            this.handleToggleNotifications,
            false
          ),
          this.renderToggle(
            notif_on && desktop_on,
            _("Desktop & mobile pop-ups"),
            _("Also show a system notification pop-up. Needs notification permission."),
            this.handleToggleDesktop,
            !notif_on
          ),
          (notif_on && desktop_on && perm === "denied")
            ? h("div.settings-note", _("Pop-ups are blocked in your browser. Allow notifications for this site to receive them."))
            : null
        ])
      ]);
    }
  }

  Object.assign(SettingsPage.prototype, LogMixin);
  window.SettingsPage = SettingsPage;

})();
