(function() {

  // Onboarding banner shown above the (empty) inbox until this xite acts as
  // an xID whose channel keys are published in the hub. Two steps: connect
  // your xID, then the node publishes your keys (no click needed; it runs the
  // moment an identity is linked and retries by itself).
  class StartScreen {
    constructor() {
      this.handleCtaClick = this.handleCtaClick.bind(this);
    }

    getState() {
      var state = {};
      state.cert = !!(Page.site_info && Page.site_info.cert_user_id);
      state.loading = state.cert && !Page.user.inited;
      state.keys = !!Page.user.publickey;
      state.pending = state.cert && !state.keys && Page.user.setupPending();
      state.error = state.cert && !state.keys ? Page.user.setupError() : null;
      state.outdated = Page.server_info && Page.server_info.rev < 630;
      return state;
    }

    getStatus(state) {
      if (state.loading) return _("Loading your identity...");
      if (state.pending) return _("Publishing your keys to the channel hub...");
      if (Page.site_info && Page.site_info.bad_files > 0 && Page.site_info.workers > 0) {
        return _("Syncing encrypted mailboxes...");
      }
      return null;
    }

    // One stable handler (maquette needs identical handler identity between
    // renders), branching at click time
    handleCtaClick() {
      var state = this.getState();
      if (!state.cert) {
        Page.cmd("certXid", []);
      } else if (!state.keys && !state.loading && !state.pending) {
        Page.user.createData();
      }
      return false;
    }

    renderStep(num, title, done, active) {
      return h("div.onboarding-step", {
        key: "step-" + num,
        classes: {done: done, active: active, pending: !done && !active}
      }, [
        h("span.onboarding-step-marker", done ? "✓" : String(num)),
        h("span.onboarding-step-title", title)
      ]);
    }

    render() {
      var state = this.getState();
      var status = this.getStatus(state);
      var cta = null;
      if (state.outdated) {
        cta = h("a.button.button-submit.onboarding-cta.disabled", {href: "#Update"}, _("Please update your EpixNet client"));
      } else if (!state.cert) {
        cta = h("a.button.button-submit.onboarding-cta", {href: "#Get+started", onclick: this.handleCtaClick}, _("Connect your xID"));
      } else if (!state.loading && !state.keys && !state.pending) {
        cta = h("a.button.button-submit.onboarding-cta", {href: "#Retry", onclick: this.handleCtaClick},
          state.error ? _("Retry setup") : _("Set up channel keys"));
      }
      return h("div.StartScreen", {key: "start"}, [
        h("div.onboarding", [
          h("div.onboarding-head", [
            h("img.onboarding-logo", {src: "img/logo.svg", alt: ""}),
            h("h2.onboarding-title", _("Welcome to Epix Mail"))
          ]),
          h("p.onboarding-intro", [
            _("End-to-end encrypted mail on a peer-to-peer network."), " ",
            _("No servers, no accounts - just your xID."), " ",
            _("You can read as a visitor; sending needs an xID.")
          ]),
          h("div.onboarding-steps", [
            this.renderStep(1, _("Connect your xID"), state.cert, !state.cert),
            this.renderStep(2, _("Channel keys published"), state.keys, state.cert && !state.keys)
          ]),
          status ? h("div.onboarding-status", [
            h("span.spinner"),
            h("span.onboarding-status-text", status)
          ]) : null,
          state.error ? h("div.onboarding-error", [_("Setup failed: ") + state.error]) : null,
          cta ? h("div.onboarding-actions", [cta]) : null
        ])
      ]);
    }
  }

  Object.assign(StartScreen.prototype, LogMixin);
  window.start_screen = new StartScreen();

})();
