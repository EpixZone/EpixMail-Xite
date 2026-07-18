(function() {
  class Menu {
    constructor() {
      this.show = this.show.bind(this);
      this.hide = this.hide.bind(this);
      this.toggle = this.toggle.bind(this);
      this.storeNode = this.storeNode.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.renderItem = this.renderItem.bind(this);
      this.render = this.render.bind(this);
      this.visible = false;
      this.items = [];
      this.node = null;
    }

    show() {
      if (window.visible_menu) window.visible_menu.hide();
      this.visible = true;
      window.visible_menu = this;
    }

    hide() { this.visible = false; }

    toggle() {
      if (this.visible) { this.hide(); } else { this.show(); }
      Page.projector.scheduleRender();
    }

    addItem(title, cb, selected) {
      if (selected == null) selected = false;
      this.items.push([title, cb, selected]);
    }

    storeNode(node) {
      this.node = node;
      if (this.visible) {
        node.className = node.className.replace("visible", "");
        setTimeout(function() { node.className += " visible"; }, 10);
      }
    }

    handleClick(e) {
      var keep_menu = false;
      for (var i = 0; i < this.items.length; i++) {
        var item = this.items[i];
        var title = item[0], cb = item[1];
        if (title === e.target.textContent) {
          keep_menu = cb(item);
        }
      }
      if (keep_menu !== true) this.hide();
      return false;
    }

    renderItem(item) {
      var title = item[0], cb = item[1], selected = item[2];
      if (typeof selected === "function") selected = selected();
      if (title === "---") {
        return h("div.menu-item-separator");
      } else {
        var href, onclick;
        if (typeof cb === "string") {
          href = cb;
          onclick = true;
        } else {
          href = "#" + title;
          onclick = this.handleClick;
        }
        return h("a.menu-item", {
          href: href, onclick: onclick, key: title,
          classes: { "selected": selected }
        }, [title]);
      }
    }

    render(class_name) {
      if (class_name == null) class_name = "";
      if (this.visible || this.node) {
        return h("div.menu" + class_name, {
          classes: { "visible": this.visible },
          afterCreate: this.storeNode
        }, this.items.map(this.renderItem));
      }
    }
  }

  window.Menu = Menu;

  document.body.addEventListener("mouseup", function(e) {
    if (!window.visible_menu || !window.visible_menu.node) return false;
    var node = window.visible_menu.node;
    var wrap = node.parentNode;
    // Keep the menu when releasing inside it or its wrap: the toggle button
    // lives in the wrap and its own mousedown handler does the toggling.
    // (Deep buttons like the rail account block have nested spans, which the
    // old parentNode-hopping checks misjudged as "outside".)
    if (node.contains(e.target) || (wrap && wrap.contains(e.target))) return;
    window.visible_menu.hide();
    Page.projector.scheduleRender();
  });
})();
