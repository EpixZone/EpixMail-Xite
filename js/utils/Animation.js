(function() {

  class Animation {
    slideDown(elem, props) {
      if (props.disableAnimation) return;
      var h = elem.offsetHeight;
      var cstyle = window.getComputedStyle(elem);
      var margin_top = cstyle.marginTop;
      var margin_bottom = cstyle.marginBottom;
      var padding_top = cstyle.paddingTop;
      var padding_bottom = cstyle.paddingBottom;

      elem.style.boxSizing = "border-box";
      elem.style.overflow = "hidden";
      elem.style.transform = "scale(0.8)";
      elem.style.opacity = "0";
      elem.style.height = "0px";
      elem.style.marginTop = "0px";
      elem.style.marginBottom = "0px";
      elem.style.paddingTop = "0px";
      elem.style.paddingBottom = "0px";
      elem.style.transition = "none";

      setTimeout(function() {
        elem.className += " animate-back";
        elem.style.height = h + "px";
        elem.style.transform = "scale(1)";
        elem.style.opacity = "1";
        elem.style.marginTop = margin_top;
        elem.style.marginBottom = margin_bottom;
        elem.style.paddingTop = padding_top;
        elem.style.paddingBottom = padding_bottom;
      }, 1);

      elem.addEventListener("transitionend", function() {
        elem.classList.remove("animate-back");
        elem.style.transition = elem.style.transform = elem.style.opacity = elem.style.height = null;
        elem.style.boxSizing = elem.style.marginTop = elem.style.marginBottom = null;
        elem.style.paddingTop = elem.style.paddingBottom = elem.style.overflow = null;
      });
    }

    slideUp(elem, remove_func, props) {
      elem.className += " animate-back";
      elem.style.boxSizing = "border-box";
      elem.style.height = elem.offsetHeight + "px";
      elem.style.overflow = "hidden";
      elem.style.transform = "scale(1)";
      elem.style.opacity = "1";
      setTimeout(function() {
        elem.style.height = "0px";
        elem.style.marginTop = "0px";
        elem.style.marginBottom = "0px";
        elem.style.paddingTop = "0px";
        elem.style.paddingBottom = "0px";
        elem.style.transform = "scale(0.8)";
        elem.style.borderTopWidth = "0px";
        elem.style.borderBottomWidth = "0px";
        elem.style.opacity = "0";
      }, 1);
      elem.addEventListener("transitionend", remove_func);
    }

    show(elem, props) {
      var delay = (arguments[arguments.length - 2] && arguments[arguments.length - 2].delay * 1000) || 1;
      elem.className += " animate";
      elem.style.opacity = 0;
      setTimeout(function() {
        elem.style.opacity = 1;
      }, delay);
      elem.addEventListener("transitionend", function() {
        elem.classList.remove("animate");
        elem.style.opacity = null;
      });
    }

    // The "encrypting" effect: characters of a form field turn into random
    // Braille glyphs while the message is encrypted and signed.
    scramble(elem) {
      if (!elem) return;
      var text_original = elem.value;
      var chars = elem.value.split("");
      chars = chars.filter(function(char) {
        return char !== "\n" && char !== "\r" && char !== " " && char !== "\u200B";
      });

      var replaces = ["\u280B", "\u2819", "\u2839", "\u2812", "\u2814", "\u2803", "\u2873", "\u2801", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
      replaces.sort(function() {
        return 0.5 - Math.random();
      });

      var frame = 0;
      var timer = setInterval(function() {
        for (var i = 0; i <= Math.round(text_original.length / 20); i++) {
          var char = chars.shift();
          elem.value = elem.value.replace(char, replaces[(frame + i) % replaces.length]);
        }
        if (chars.length === 0) {
          clearInterval(timer);
        }
        frame += 1;
      }, 50);
    }

    // Same effect for non-form elements (recipient chips): operates on
    // textContent instead of value.
    scrambleText(elem) {
      if (!elem) return;
      var text_original = elem.textContent;
      var chars = text_original.split("").filter(function(char) {
        return char !== "\n" && char !== "\r" && char !== " " && char !== "\u200B";
      });

      var replaces = ["\u280B", "\u2819", "\u2839", "\u2812", "\u2814", "\u2803", "\u2873", "\u2801", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
      replaces.sort(function() {
        return 0.5 - Math.random();
      });

      var frame = 0;
      var timer = setInterval(function() {
        for (var i = 0; i <= Math.round(text_original.length / 20); i++) {
          var char = chars.shift();
          elem.textContent = elem.textContent.replace(char, replaces[(frame + i) % replaces.length]);
        }
        if (chars.length === 0) {
          clearInterval(timer);
        }
        frame += 1;
      }, 50);
    }
  }

  window.Animation = new Animation();

})();
