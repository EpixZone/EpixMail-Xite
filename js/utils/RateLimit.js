(function() {

  var limits = {};

  window.RateLimit = function(interval, fn) {
    if (!limits[fn]) {
      limits[fn] = true;
      fn();
      setTimeout(function() {
        delete limits[fn];
      }, interval);
    }
  };

})();
