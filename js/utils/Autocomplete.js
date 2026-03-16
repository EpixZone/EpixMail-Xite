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
      var current_value = this.attrs.value;
      var values = this.getValues();
      var re_highlight = new RegExp("^(.*?)(" + filter.split("").join(")(.*?)(") + ")(.*?)$", "i");
      var res = [];
      for (var vi = 0; vi < values.length; vi++) {
        var value = values[vi];
        var distance = Text.distance(value, current_value);
        if (distance !== false) {
          var match = value.match(re_highlight);
          if (!match) continue;
          var parts = match.map(function(part, i) {
            if (i % 2 === 0) {
              return "<b>" + part + "</b>";
            } else {
              return part;
            }
          });
          parts.shift();
          res.push([parts.join(""), distance]);
        }
      }

      res.sort(function(a, b) {
        return a[1] - b[1];
      });

      this.values = res.slice(0, 10).map(function(row) { return row[0]; });
      return this.values;
    }

    renderValue(node, projector_options, children, attrs) {
      node.innerHTML = attrs.key;
    }

    handleInput(e) {
      this.attrs.value = e.target.value;
      this.selected_index = 0;
      this.focus = true;
    }

    handleKey(e) {
      if (e.keyCode === 38) {
        this.selected_index = Math.max(0, this.selected_index - 1);
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
      this.selected_index = 0;
      this.focus = true;
    }

    handleBlur(e) {
      var selected_value = this.node.querySelector(".values .value.selected");
      if (selected_value) {
        this.setValue(selected_value.textContent);
      } else if (this.attrs.value) {
        var values = this.filterValues(this.attrs.value);
        if (values.length > 0) {
          this.setValue(values[0].replace(/<.*?>/g, ""));
        } else {
          this.setValue("");
        }
      } else {
        this.setValue("");
      }
      this.focus = false;
    }

    render() {
      return h("div.Autocomplete", {"afterCreate": this.setNode}, [
        h("input.to", this.attrs),
        (this.focus && this.attrs.value) ? h("div.values", {"exitAnimation": Animation.slideUp}, [
          this.filterValues(this.attrs.value).map((value, i) => {
            return h("a.value", {
              "href": "#Select+Address", "key": value, "tabindex": "-1",
              "afterCreate": this.renderValue,
              "onmousedown": this.handleClick,
              "classes": {"selected": this.selected_index === i}
            });
          })
        ]) : null
      ]);
    }
  }

  window.Autocomplete = Autocomplete;

})();
