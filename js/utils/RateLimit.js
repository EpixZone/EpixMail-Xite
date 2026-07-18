(function() {

  var limits = {};

  // Rate-limit `fn` to once per `interval`, on the leading edge, but remember
  // if more calls arrived during the interval and run one trailing call at the
  // end. Without the trailing call, a burst of file_done events during a sync
  // fires the reload on the first file and silently drops the rest, leaving
  // the last-synced messages invisible until an unrelated event.
  window.RateLimit = function(interval, fn) {
    if (limits[fn]) {
      limits[fn].trailing = true;
      return;
    }
    limits[fn] = {trailing: false};
    fn();
    setTimeout(function() {
      var pending = limits[fn] && limits[fn].trailing;
      delete limits[fn];
      if (pending) {
        window.RateLimit(interval, fn);
      }
    }, interval);
  };

})();
