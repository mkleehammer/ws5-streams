
'use strict';

module.exports = SequentialPullSource;

function SequentialPullSource(limit, options) {
  options = options || {};

  this.current = 0;
  this.limit = limit;
  this.opened = false;
  this.closed = false;

  this._exec = function(f) { return f(); };
  if (options.async) {
    this._exec = function(f) { setImmediate(f); };
  }
}

SequentialPullSource.prototype = Object.create(null, {
  open: {
    value: function(cb) {
      var _this = this;
      this._exec(function() {
        _this.opened = true;
        cb();
      });
    }
  },

  read: {
    value: function(cb) {
      var _this = this;
      this._exec(function() {
        if (++_this.current <= _this.limit) {
          cb(null, false, _this.current);
        } else {
          cb(null, true, null);
        }
      });
    }
  },

  close: {
    value: function(cb) {
      var _this = this;
      this._exec(function() {
        _this.closed = true;
        cb();
      });
    }
  }
});
