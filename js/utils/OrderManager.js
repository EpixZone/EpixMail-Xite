(function() {

  class OrderManager {
    constructor() {
      this.entering = {};
      this.exiting = {};
    }

    registerEnter(elem, props, cb) {
      this.entering[props.key] = [elem, cb];
    }

    registerExit(elem, props, cb) {
      this.exiting[props.key] = [elem, cb];
    }

    animateChange(elem, before, after) {
      var height = elem.offsetHeight;
      elem.style.width = elem.offsetWidth + "px";
      elem.style.transition = "none";
      elem.style.boxSizing = "border-box";
      elem.style.float = "left";
      elem.style.marginTop = (0 - height) + "px";
      elem.style.transform = "TranslateY(" + (before - after + height) + "px)";
      setTimeout(function() {
        elem.style.transition = null;
        elem.className += " animate-back";
      }, 1);
      setTimeout(function() {
        elem.style.transform = "TranslateY(0px)";
        elem.style.marginTop = "0px";
        elem.addEventListener("transitionend", function() {
          elem.classList.remove("animate-back");
          elem.style.boxSizing = elem.style.float = elem.style.marginTop = elem.style.transform = elem.style.width = null;
        });
      }, 2);
    }

    execute(elem, projection_options, selector, properties, childs) {
      var s = Date.now();
      var has_entering = JSON.stringify(this.entering) !== "{}";
      var has_exiting = JSON.stringify(this.exiting) !== "{}";
      if (!has_exiting && !has_entering) return false;

      var moving = {};

      this.log(Date.now() - s);
      if (childs.length < 5000) {
        if (has_entering && has_exiting) {
          for (var i = 0; i < childs.length; i++) {
            var child = childs[i];
            var key = child.properties.key;
            if (!key) continue;
            if (!this.entering[key]) {
              moving[key] = [child, child.domNode.offsetTop];
            }
          }
        }
      }

      this.log(Date.now() - s);
      for (var ekey in this.exiting) {
        var exit_entry = this.exiting[ekey];
        var child_elem = exit_entry[0];
        var exitanim = exit_entry[1];
        if (!this.entering[ekey]) {
          exitanim();
        } else {
          elem.removeChild(child_elem);
        }
      }
      this.log(Date.now() - s);

      for (var nkey in this.entering) {
        var enter_entry = this.entering[nkey];
        var enteranim = enter_entry[1];
        if (!this.exiting[nkey]) {
          enteranim();
        }
      }
      this.log(Date.now() - s);

      for (var mkey in moving) {
        var move_entry = moving[mkey];
        var mchild = move_entry[0];
        var top_before = move_entry[1];
        var top_after = mchild.domNode.offsetTop;
        console.log("animateChange", top_before, top_after);
        if (top_before !== top_after) {
          this.animateChange(mchild.domNode, top_before, top_after);
        }
      }

      this.entering = {};
      this.exiting = {};

      this.log(Date.now() - s, arguments);
    }
  }

  Object.assign(OrderManager.prototype, LogMixin);
  window.OrderManager = OrderManager;

})();
