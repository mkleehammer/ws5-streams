
'use strict';

module.exports = ReadableStream;

const assert = require('assert');

var helpers = require('./helpers');

var ops = require('./readable-stream-abstract-ops');

var AcquireExclusiveStreamReader = ops.AcquireExclusiveStreamReader;
var CallReadableStreamPull = ops.CallReadableStreamPull;
var CancelReadableStream = ops.CancelReadableStream;
var CreateReadableStreamCloseFunction = ops.CreateReadableStreamCloseFunction;
var CreateReadableStreamEnqueueFunction = ops.CreateReadableStreamEnqueueFunction;
var CreateReadableStreamErrorFunction = ops.CreateReadableStreamErrorFunction;
var IsReadableStream = ops.IsReadableStream;
var IsReadableStreamLocked = ops.IsReadableStreamLocked;
var ReadFromReadableStream = ops.ReadFromReadableStream;
var ShouldReadableStreamApplyBackpressure = ops.ShouldReadableStreamApplyBackpressure;

function ReadableStream(underlyingSource) {
  underlyingSource = underlyingSource|| {};

  this._underlyingSource = underlyingSource;
  this._initReadyPromise();
  this._initClosedPromise();
  this._queue = [];
  this._state = 'waiting';
  this._started = false;
  this._draining = false;
  this._pullScheduled = false;
  this._pullingPromise = undefined;
  this._readableStreamReader = undefined;

  this._enqueue = CreateReadableStreamEnqueueFunction(this);
  this._close = CreateReadableStreamCloseFunction(this);
  this._error = CreateReadableStreamErrorFunction(this);

  const startResult = helpers.InvokeOrNoop(underlyingSource, 'start', [this._enqueue, this._close, this._error]);
  Promise.resolve(startResult).then(
    function() {
      this._started = true;
      CallReadableStreamPull(this);
    },
    function(r) { return this._error(r); }
  );
}

ReadableStream.prototype = Object.create(null, {

  closed: {
    get: function() {
      if (!IsReadableStream(this)) {
        return Promise.reject(new TypeError('ReadableStream.prototype.closed can only be used on a ReadableStream'));
      }

      return this._closedPromise;
    }
  },

  state: {
    get: function() {
      if (!IsReadableStream(this)) {
        throw new TypeError('ReadableStream.prototype.state can only be used on a ReadableStream');
      }

      if (IsReadableStreamLocked(this)) {
        return 'waiting';
      }

      return this._state;
    }
  },

  cancel: {
    value: function (reason) {
      if (!IsReadableStream(this)) {
        return Promise.reject(new TypeError('ReadableStream.prototype.cancel can only be used on a ReadableStream'));
      }

      if (IsReadableStreamLocked(this)) {
        return Promise.reject(
          new TypeError('This stream is locked to a single exclusive reader and cannot be cancelled directly'));
      }

      return CancelReadableStream(this, reason);
    }
  },

  getReader: {
    value: function() {
      if (!IsReadableStream(this)) {
        throw new TypeError('ReadableStream.prototype.getReader can only be used on a ReadableStream');
      }

      return AcquireExclusiveStreamReader(this);
    }
  },

  pipeThrough: {
    value: function(pair, options) {

      if (!helpers.typeIsObject(pair.writable)) {
        throw new TypeError('A transform stream must have an writable property that is an object.');
      }

      if (!helpers.typeIsObject(pair.readable)) {
        throw new TypeError('A transform stream must have a readable property that is an object.');
      }

      this.pipeTo(pair.writable, options);
      return pair.readable;
    }
  },

  pipeTo: {
    value: function(dest, options) {

      options = options || {};

      var preventClose  = Boolean(options.preventClose);
      var preventAbort  = Boolean(options.preventAbort);
      var preventCancel = Boolean(options.preventCancel);

      let source;
      let resolvePipeToPromise;
      let rejectPipeToPromise;

      return new Promise(function(resolve, reject)  {
        resolvePipeToPromise = resolve;
        rejectPipeToPromise = reject;

        source = this.getReader();
        doPipe();
      }.bind(this));

      function doPipe() {
        for (;;) {
          const ds = dest.state;
          if (ds === 'writable') {
            if (source.state === 'readable') {
              dest.write(source.read());
              continue;
            } else if (source.state === 'waiting') {
              Promise.race([source.ready, dest.closed]).then(doPipe, doPipe);
            } else if (source.state === 'errored') {
              source.closed.catch(abortDest);
            } else if (source.state === 'closed') {
              closeDest();
            }
          } else if (ds === 'waiting') {
            if (source.state === 'readable') {
              Promise.race([source.closed, dest.ready]).then(doPipe, doPipe);
            } else if (source.state === 'waiting') {
              Promise.race([source.ready, dest.ready]).then(doPipe);
            } else if (source.state === 'errored') {
              source.closed.catch(abortDest);
            } else if (source.state === 'closed') {
              closeDest();
            }
          } else if (ds === 'errored' && (source.state === 'readable' || source.state === 'waiting')) {
            dest.closed.catch(cancelSource);
          } else if ((ds === 'closing' || ds === 'closed') &&
                     (source.state === 'readable' || source.state === 'waiting')) {
            cancelSource(new TypeError('destination is closing or closed and cannot be piped to anymore'));
          }
          return;
        }
      }

      function cancelSource(reason) {
        if (preventCancel === false) {
          // implicitly releases the lock
          source.cancel(reason);
        } else {
          source.releaseLock();
        }
        rejectPipeToPromise(reason);
      }

      function closeDest() {
        source.releaseLock();
        if (preventClose === false) {
          dest.close().then(resolvePipeToPromise, rejectPipeToPromise);
        } else {
          resolvePipeToPromise();
        }
      }

      function abortDest(reason) {
        source.releaseLock();
        if (preventAbort === false) {
          dest.abort(reason);
        }
        rejectPipeToPromise(reason);
      }
    }
  },

  read: {
    value: function() {
    if (!IsReadableStream(this)) {
      throw new TypeError('ReadableStream.prototype.read can only be used on a ReadableStream');
    }

    if (IsReadableStreamLocked(this)) {
      throw new TypeError('This stream is locked to a single exclusive reader and cannot be read from directly');
    }

    return ReadFromReadableStream(this);
    }
  },

  ready: {
    get: function() {
    if (!IsReadableStream(this)) {
      return Promise.reject(new TypeError('ReadableStream.prototype.ready can only be used on a ReadableStream'));
    }

    return this._readyPromise;
    }
  },

  _initReadyPromise: {
    value: function() {
    this._readyPromise = new Promise(function(resolve, reject) {
      this._readyPromise_resolve = resolve;
    }.bind(this));
    }
  },

  _initClosedPromise: {
    value: function() {
    this._closedPromise = new Promise(function(resolve, reject) {
      this._closedPromise_resolve = resolve;
      this._closedPromise_reject = reject;
    }.bind(this));
    }
  },

  // Note: The resolve function and reject function are cleared when the
  // corresponding promise is resolved or rejected. This is for debugging. This
  // makes extra resolve/reject calls for the same promise fail so that we can
  // detect unexpected extra resolve/reject calls that may be caused by bugs in
  // the algorithm.

  _resolveReadyPromise: {
    value: function(value) {
    this._readyPromise_resolve(value);
    this._readyPromise_resolve = null;
    }
  },

  _resolveClosedPromise: {
    value: function(value) {
    this._closedPromise_resolve(value);
    this._closedPromise_resolve = null;
    this._closedPromise_reject = null;
    }
  },

  _rejectClosedPromise: {
    value: function(reason) {
    this._closedPromise_reject(reason);
    this._closedPromise_resolve = null;
    this._closedPromise_reject = null;
    }
  }
});
