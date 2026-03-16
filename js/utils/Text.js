(function() {

  class MarkedRenderer extends marked.Renderer {
    image(href, title, text) {
      return "<code>![" + text + "](" + href + ")</code>";
    }
  }

  class Text {
    toColor(text) {
      var hash = 0;
      for (var i = 0; i < text.length; i++) {
        hash += text.charCodeAt(i) * i;
        hash = hash % 1000;
      }
      return "hsl(" + (hash % 360) + ",30%,50%)";
    }

    renderMarked(text, options) {
      if (!options) options = {};
      options["gfm"] = true;
      options["breaks"] = true;
      options["renderer"] = marked_renderer;
      text = this.fixReply(text);
      text = marked(text, options);
      text = this.emailLinks(text);
      return this.fixHtmlLinks(text);
    }

    emailLinks(text) {
      return text;
    }

    fixHtmlLinks(text) {
      if (window.is_proxy) {
        return text.replace(/href="http:\/\/(127.0.0.1|localhost):43110/g, 'href="http://epix');
      } else {
        return text.replace(/href="http:\/\/(127.0.0.1|localhost):43110/g, 'href="');
      }
    }

    fixLink(link) {
      if (window.is_proxy) {
        return link.replace(/http:\/\/(127.0.0.1|localhost):43110/, 'http://epix');
      } else {
        return link.replace(/http:\/\/(127.0.0.1|localhost):43110/, '');
      }
    }

    toUrl(text) {
      return text.replace(/[^A-Za-z0-9]/g, "+").replace(/[+]+/g, "+").replace(/[+]+$/, "");
    }

    fixReply(text) {
      return text.replace(/(>.*\n)([^\n>])/gm, "$1\n$2");
    }

    toBitcoinAddress(text) {
      return text.replace(/[^A-Za-z0-9]/g, "");
    }

    jsonEncode(obj) {
      return unescape(encodeURIComponent(JSON.stringify(obj)));
    }

    jsonDecode(obj) {
      return JSON.parse(decodeURIComponent(escape(obj)));
    }

    fileEncode(obj) {
      if (typeof obj === "string") {
        return btoa(unescape(encodeURIComponent(obj)));
      } else {
        return btoa(unescape(encodeURIComponent(JSON.stringify(obj, undefined, '\t'))));
      }
    }

    utf8Encode(s) {
      return unescape(encodeURIComponent(s));
    }

    utf8Decode(s) {
      return decodeURIComponent(escape(s));
    }

    distance(s1, s2) {
      s1 = s1.toLocaleLowerCase();
      s2 = s2.toLocaleLowerCase();
      var next_find_i = 0;
      var next_find = s2[0];
      var extra_parts = {};
      for (var ci = 0; ci < s1.length; ci++) {
        var char = s1[ci];
        if (char !== next_find) {
          if (extra_parts[next_find_i]) {
            extra_parts[next_find_i] += char;
          } else {
            extra_parts[next_find_i] = char;
          }
        } else {
          next_find_i++;
          next_find = s2[next_find_i];
        }
      }

      if (extra_parts[next_find_i]) {
        extra_parts[next_find_i] = "";
      }
      var extra_values = Object.values(extra_parts);
      if (next_find_i >= s2.length) {
        return extra_values.length + extra_values.join("").length;
      } else {
        return false;
      }
    }

    parseQuery(query) {
      var params = {};
      var parts = query.split('&');
      for (var i = 0; i < parts.length; i++) {
        var pair = parts[i].split("=");
        var key = pair[0];
        var val = pair[1];
        if (val) {
          params[decodeURIComponent(key)] = decodeURIComponent(val);
        } else {
          params["url"] = decodeURIComponent(key);
        }
      }
      return params;
    }

    encodeQuery(params) {
      var back = [];
      if (params.url) {
        back.push(params.url);
      }
      for (var key in params) {
        var val = params[key];
        if (!val || key === "url") continue;
        back.push(encodeURIComponent(key) + "=" + encodeURIComponent(val));
      }
      return back.join("&");
    }
  }

  window.is_proxy = (window.location.pathname === "/");
  window.marked_renderer = new MarkedRenderer();
  window.Text = new Text();

})();
