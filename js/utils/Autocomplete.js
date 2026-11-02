(function() {

  class Autocomplete {
    constructor(getValues, attrs, onChanged) {
      this.getValues = getValues;
      this.attrs = attrs || {};
      this.onChanged = onChanged || null;

      this.handleInput = this.handleInput.bind(this);
      this.handleFocus = this.handleFocus.bind(this);
      this.handleBlur = this.handleBlur.bind(this);
      this.handleKey = this.handleKey.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.setNode = this.setNode.bind(this);

      this.attrs.oninput = this.handleInput;
      this.attrs.onfocus = this.handleFocus;
      this.attrs.onblur = this.handleBlur;
      this.attrs.onkeydown = this.handleKey;

      this.values = [];
      this.selected_index = 0;
      this.focus = false;
      this.node = null;
    }

    setNode(node) {
      this.node = node;
    }

    setValue(value) {
      this.attrs.value = value;
      if (this.onChanged) {
        this.onChanged(value);
      }
      Page.projector.scheduleRender();
    }

    filterValues(filter) {
      var matches = [];
      for (var value of this.getValues()) {
        var distance = Text.distance(value, filter);
        if (distance !== false) matches.push({value: value, distance: distance});
      }
      matches.sort((a, b) => a.distance - b.distance);
      this.values = matches.slice(0, 10).map((match) => match.value);
      return this.values;
    }

    highlightedName(value, filter) {
      var children = [];
      var start = 0;
      var next = 0;
      for (var i = 0; i < value.length && next < filter.length; i++) {
        if (value[i].toLocaleLowerCase() !== filter[next].toLocaleLowerCase()) continue;
        if (i > start) children.push(value.slice(start, i));
        children.push(h("b", {key: i}, value[i]));
        start = i + 1;
        next++;
      }
      children.push(value.slice(start));
      return children;
    }

    handleInput(e) {
      this.attrs.value = e.target.value;
      // No auto-highlight: blur/Enter commits what was TYPED. The user must
      // arrow into a suggestion to pick it. (Auto-selecting index 0 made it
      // impossible to address a brand-new recipient, because blur then
      // substituted the closest existing contact.)
      this.selected_index = -1;
      this.focus = true;
    }

    handleKey(e) {
      if (e.keyCode === 38) {
        this.selected_index = Math.max(-1, this.selected_index - 1);
        return false;
      } else if (e.keyCode === 40) {
        this.selected_index = Math.min(this.values.length - 1, this.selected_index + 1);
        return false;
      } else if (e.keyCode === 13) {
        this.handleBlur(e);
        return false;
      }
    }

    handleClick(e) {
      if (!e.currentTarget) e.currentTarget = e.explicitOriginalTarget;
      this.attrs.value = e.currentTarget.textContent;
      if (this.onChanged) {
        this.onChanged(this.attrs.value);
      }
      this.focus = false;
      Page.projector.scheduleRender();
      return false;
    }

    handleFocus(e) {
      this.selected_index = -1;
      this.focus = true;
    }

    handleBlur(e) {
      var selected_value = this.node.querySelector(".values .value.selected");
      if (selected_value) {
        // The user arrowed into a suggestion: commit that.
        this.setValue(selected_value.textContent);
      } else if (this.attrs.value) {
        // Commit the raw typed value; the consumer validates it. (Was:
        // substitute the closest existing contact, which silently changed the
        // recipient and blocked composing to anyone new.)
        this.setValue(this.attrs.value);
      } else {
        this.setValue("");
      }
      this.focus = false;
    }

    render() {
      // Fresh properties object each render: passing the same mutable object
      // makes maquette's previousProperties === properties, so mutations like
      // the placeholder would never reach the DOM.
      var input_attrs = {autocomplete: "off"};
      for (var k in this.attrs) input_attrs[k] = this.attrs[k];
      return h("div.Autocomplete", {"afterCreate": this.setNode}, [
        h("input.to", input_attrs),
        (this.focus && this.attrs.value) ? h("div.values", {"exitAnimation": Animation.slideUp}, [
          this.filterValues(this.attrs.value).map((value, i) => {
            return h("a.value", {
              "href": "#Select+Address", "key": value, "tabindex": "-1",
              "onmousedown": this.handleClick,
              "classes": {"selected": this.selected_index === i}
            }, this.highlightedName(value, this.attrs.value));
          })
        ]) : null
      ]);
    }
  }

  window.Autocomplete = Autocomplete;

})();
