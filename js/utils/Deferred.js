(function() {

  class Deferred {
    constructor() {
      this.resolved = false;
      this.end_promise = null;
      this.result = null;
      this.data = null;
      this.callbacks = [];
    }

    resolve() {
      if (this.resolved) return false;
      this.resolved = true;
      this.data = arguments.length ? Array.prototype.slice.call(arguments) : [true];
      this.result = this.data[0];
      var back;
      for (var i = 0; i < this.callbacks.length; i++) {
        back = this.callbacks[i].apply(this.callbacks[i], this.data);
      }
      if (this.end_promise) {
        this.end_promise.resolve(back);
      }
    }

    fail() {
      this.resolve(false);
    }

    then(callback) {
      if (this.resolved === true) {
        callback.apply(callback, this.data);
        return;
      }
      this.callbacks.push(callback);
      this.end_promise = new Deferred();
      return this.end_promise;
    }

    static when() {
      var tasks = Array.prototype.slice.call(arguments);
      var num_uncompleted = tasks.length;
      var args = new Array(num_uncompleted);
      var promise = new Deferred();

      for (var i = 0; i < tasks.length; i++) {
        (function(task_id) {
          tasks[task_id].then(function() {
            args[task_id] = Array.prototype.slice.call(arguments);
            num_uncompleted--;
            if (num_uncompleted === 0) {
              promise.resolve.apply(promise, args);
            }
          });
        })(i);
      }

      return promise;
    }
  }

  window.Deferred = Deferred;

})();
