
'use strict';

const assert = require('assert');
var helpers = require('./helpers');
var InvokeOrNoop = helpers.InvokeOrNoop;
var PromiseInvokeOrNoop = helpers.PromiseInvokeOrNoop;
var PromiseInvokeOrFallbackOrNoop = helpers.PromiseInvokeOrFallbackOrNoop;
var typeIsObject = helpers.typeIsObject;

var QueueWithSizes = require('./queue-with-sizes');
var DequeueValue = QueueWithSizes.DequeueValue;
var EnqueueValueWithSize = QueueWithSizes.EnqueueValueWithSize;
var GetTotalQueueSize = QueueWithSizes.GetTotalQueueSize;
var PeekQueueValue = QueueWithSizes.PeekQueueValue;

var CountQueuingStrategy = require('./count-queuing-strategy');

exports.WritableStream = WritableStream;
exports.IsWritableStream = IsWritableStream;

function WritableStream(underlyingSink) {
  underlyingSink = underlyingSink || {};
  
  this._underlyingSink = underlyingSink;

  this._closedPromise = new Promise(function(resolve, reject) {
    this._closedPromise_resolve = resolve;
    this._closedPromise_reject = reject;
  }.bind(this));

  this._readyPromise = Promise.resolve(undefined);
  this._readyPromise_resolve = null;

  this._queue = [];
  this._state = 'writable';
  this._started = false;
  this._writing = false;

  this._error = CreateWritableStreamErrorFunction(this);

  SyncWritableStreamStateWithQueue(this);

  const startResult = InvokeOrNoop(underlyingSink, 'start', [this._error]);
  this._startedPromise = Promise.resolve(startResult);
  this._startedPromise.then(function() {
    this._started = true;
    this._startedPromise = undefined;
  }.bind(this));
  this._startedPromise.catch(function(r) { return this._error(r); }.bind(this));
}

WritableStream.prototype = Object.create(WritableStream.prototype, {

  closed: {
    get: function() {
      if (!IsWritableStream(this)) {
        return Promise.reject(new TypeError('WritableStream.prototype.closed can only be used on a WritableStream'));
      }

      return this._closedPromise;
    }
  },

  state: {
    get: function() {
      if (!IsWritableStream(this)) {
        throw new TypeError('WritableStream.prototype.state can only be used on a WritableStream');
      }

      return this._state;
    }
  },

  abort: {
    value: function(reason) {
      if (!IsWritableStream(this)) {
        return Promise.reject(new TypeError('WritableStream.prototype.abort can only be used on a WritableStream'));
      }

      if (this._state === 'closed') {
        return Promise.resolve(undefined);
      }
      if (this._state === 'errored') {
        return Promise.reject(this._storedError);
      }

      this._error(reason);
      const sinkAbortPromise = PromiseInvokeOrFallbackOrNoop(this._underlyingSink, 'abort', [reason], 'close', []);
      return sinkAbortPromise.then(function() {});
    }
  },

  close: {
    value: function() {
      if (!IsWritableStream(this)) {
        return Promise.reject(new TypeError('WritableStream.prototype.close can only be used on a WritableStream'));
      }

      if (this._state === 'closing') {
        return Promise.reject(new TypeError('cannot close an already-closing stream'));
      }
      if (this._state === 'closed') {
        return Promise.reject(new TypeError('cannot close an already-closed stream'));
      }
      if (this._state === 'errored') {
        return Promise.reject(this._storedError);
      }
      if (this._state === 'waiting') {
        this._readyPromise_resolve(undefined);
      }

      this._state = 'closing';
      EnqueueValueWithSize(this._queue, 'close', 0);
      CallOrScheduleWritableStreamAdvanceQueue(this);

      return this._closedPromise;
    }
  },

  ready: {
    get: function() {
      if (!IsWritableStream(this)) {
        return Promise.reject(new TypeError('WritableStream.prototype.ready can only be used on a WritableStream'));
      }

      return this._readyPromise;
    }
  },

  write: {
    value: function(chunk) {
      if (!IsWritableStream(this)) {
        return Promise.reject(new TypeError('WritableStream.prototype.write can only be used on a WritableStream'));
      }

      if (this._state === 'closing') {
        return Promise.reject(new TypeError('cannot write while stream is closing'));
      }
      if (this._state === 'closed') {
        return Promise.reject(new TypeError('cannot write after stream is closed'));
      }
      if (this._state === 'errored') {
        return Promise.reject(this._storedError);
      }

      assert(this._state === 'waiting' || this._state === 'writable');

      let chunkSize = 1;

      let strategy;
      try {
        strategy = this._underlyingSink.strategy;
      } catch (strategyE) {
        this._error(strategyE);
        return Promise.reject(strategyE);
      }

      if (strategy !== undefined) {
        try {
          chunkSize = strategy.size(chunk);
        } catch (chunkSizeE) {
          this._error(chunkSizeE);
          return Promise.reject(chunkSizeE);
        }
      }

      let resolver, rejecter;
      const promise = new Promise(function(resolve, reject) {
        resolver = resolve;
        rejecter = reject;
      });

      const writeRecord = { promise: promise, chunk: chunk, _resolve: resolver, _reject: rejecter };
      try {
        EnqueueValueWithSize(this._queue, writeRecord, chunkSize);
      } catch (enqueueResultE) {
        this._error(enqueueResultE);
        return Promise.reject(enqueueResultE);
      }

      try {
        SyncWritableStreamStateWithQueue(this);
      } catch (syncResultE) {
        this._error(syncResultE);
        return promise;
      }

      CallOrScheduleWritableStreamAdvanceQueue(this);
      return promise;
    }
  },
});

function CallOrScheduleWritableStreamAdvanceQueue(stream) {
  if (stream._started === false) {
    stream._startedPromise.then(function() {
      WritableStreamAdvanceQueue(stream);
    });
    return undefined;
  }

  if (stream._started === true) {
    return WritableStreamAdvanceQueue(stream);
  }
}

function CloseWritableStream(stream) {
  assert(stream._state === 'closing', 'stream must be in closing state while calling CloseWritableStream');

  const sinkClosePromise = PromiseInvokeOrNoop(stream._underlyingSink, 'close');
  sinkClosePromise.then(
    function() {
      if (stream._state === 'errored') {
        return;
      }

      assert(stream._state === 'closing');

      stream._closedPromise_resolve(undefined);
      stream._state = 'closed';
    },
    function(r) {
      stream._error(r);
    }
  );
}

function CreateWritableStreamErrorFunction(stream) {
  return function(e) {
    if (stream._state === 'closed' || stream._state === 'errored') {
      return undefined;
    }

    while (stream._queue.length > 0) {
      const writeRecord = DequeueValue(stream._queue);
      if (writeRecord !== 'close') {
        writeRecord._reject(e);
      }
    }

    stream._storedError = e;

    if (stream._state === 'waiting') {
      stream._readyPromise_resolve(undefined);
    }
    stream._closedPromise_reject(e);
    stream._state = 'errored';
  };
}

function IsWritableStream(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_underlyingSink')) {
    return false;
  }

  return true;
}

function SyncWritableStreamStateWithQueue(stream) {
  if (stream._state === 'closing') {
    return undefined;
  }

  assert(stream._state === 'writable' || stream._state === 'waiting',
    'stream must be in a writable or waiting state while calling SyncWritableStreamStateWithQueue');

  const queueSize = GetTotalQueueSize(stream._queue);
  let shouldApplyBackpressure = queueSize > 0;

  const strategy = stream._underlyingSink.strategy;
  if (strategy !== undefined) {
    shouldApplyBackpressure = Boolean(strategy.shouldApplyBackpressure(queueSize));
  }

  if (shouldApplyBackpressure === true && stream._state === 'writable') {
    stream._state = 'waiting';
    stream._readyPromise = new Promise(function(resolve, reject) {
      stream._readyPromise_resolve = resolve;
    });
  }

  if (shouldApplyBackpressure === false && stream._state === 'waiting') {
    stream._state = 'writable';
    stream._readyPromise_resolve(undefined);
  }

  return undefined;
}

function WritableStreamAdvanceQueue(stream) {
  if (stream._queue.length === 0 || stream._writing === true) {
    return undefined;
  }

  const writeRecord = PeekQueueValue(stream._queue);

  if (writeRecord === 'close') {
    assert(stream._state === 'closing', 'can\'t process final write record unless already closing');
    DequeueValue(stream._queue);
    assert(stream._queue.length === 0, 'queue must be empty once the final write record is dequeued');
    return CloseWritableStream(stream);
  } else {
    stream._writing = true;

    PromiseInvokeOrNoop(stream._underlyingSink, 'write', [writeRecord.chunk]).then(
      function() {
        if (stream._state === 'errored') {
          return;
        }

        stream._writing = false;

        writeRecord._resolve(undefined);

        DequeueValue(stream._queue);
        try {
          SyncWritableStreamStateWithQueue(stream);
        } catch (syncResultE) {
          stream._error(syncResultE);
          return;
        }
        return WritableStreamAdvanceQueue(stream);
      },
      function(r) {
        stream._error(r);
      }
    )
      .catch(function(e) { process.nextTick(function() { throw e; }); }); // to catch assertion failures
  }
}
