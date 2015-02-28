
'use strict';

const assert = require('assert');

var QueueWithSizes = require('./queue-with-sizes');
var DequeueValue = QueueWithSizes.DequeueValue;
var EnqueueValueWithSize = QueueWithSizes.EnqueueValueWithSize;
var GetTotalQueueSize = QueueWithSizes.GetTotalQueueSize;

var helpers = require('./helpers');
var PromiseInvokeOrNoop = helpers.PromiseInvokeOrNoop;
var typeIsObject = helpers.typeIsObject;

exports.AcquireExclusiveStreamReader = AcquireExclusiveStreamReader;
exports.CallReadableStreamPull = CallReadableStreamPull;
exports.CancelReadableStream = CancelReadableStream;
exports.CloseReadableStreamReader = CloseReadableStreamReader;
exports.CreateReadableStreamCloseFunction = CreateReadableStreamCloseFunction;
exports.CreateReadableStreamEnqueueFunction = CreateReadableStreamEnqueueFunction;
exports.CreateReadableStreamErrorFunction = CreateReadableStreamErrorFunction;
exports.IsExclusiveStreamReader = IsExclusiveStreamReader;
exports.IsReadableStreamLocked = IsReadableStreamLocked;
exports.IsReadableStream = IsReadableStream;
exports.ReadFromReadableStream = ReadFromReadableStream;
exports.ShouldReadableStreamApplyBackpressure = ShouldReadableStreamApplyBackpressure;

function AcquireExclusiveStreamReader(stream) {
  if (stream._state === 'closed') {
    throw new TypeError('The stream has already been closed, so a reader cannot be acquired.');
  }
  if (stream._state === 'errored') {
    throw stream._storedError;
  }

  // Put here so we don't get cyclic dependencies.
  var ExclusiveStreamReader = require('./exclusive-stream-reader');
  return new ExclusiveStreamReader(stream);
}

function CallReadableStreamPull(stream) {
  if (stream._draining === true || stream._started === false ||
      stream._state === 'closed' || stream._state === 'errored' ||
      stream._pullScheduled === true) {
    return undefined;
  }

  if (stream._pullingPromise !== undefined) {
    stream._pullScheduled = true;
    stream._pullingPromise.then(function() {
      stream._pullScheduled = false;
      CallReadableStreamPull(stream);
    });
    return undefined;
  }

  const shouldApplyBackpressure = ShouldReadableStreamApplyBackpressure(stream);
  if (shouldApplyBackpressure === true) {
    return undefined;
  }

  stream._pullingPromise = PromiseInvokeOrNoop(stream._underlyingSource, 'pull', [stream._enqueue, stream._close]);
  stream._pullingPromise.then(
    function() { stream._pullingPromise = undefined; },
    function(e) {
      return stream._error(e); 
    }
  );

  return undefined;
}

function CancelReadableStream(stream, reason) {
  if (stream._state === 'closed' || stream._state === 'errored') {
    return stream._closedPromise;
  }

  stream._queue = [];
  CloseReadableStream(stream);

  const sourceCancelPromise = PromiseInvokeOrNoop(stream._underlyingSource, 'cancel', [reason]);
  return sourceCancelPromise.then(function() { return undefined; });
}

function CloseReadableStream(stream) {
  if (IsReadableStreamLocked(stream)) {
    CloseReadableStreamReader(stream._readableStreamReader);

    stream._readableStreamReader = undefined;

    // rs.ready() was pending because there was a reader.
    stream._resolveReadyPromise(undefined);
  } else if (stream._state === 'waiting') {
    stream._resolveReadyPromise(undefined);
  }

  stream._resolveClosedPromise(undefined);

  stream._state = 'closed';

  return undefined;
}

function CloseReadableStreamReader(reader) {
  if (reader._state === 'waiting') {
    reader._resolveReadyPromise(undefined);
  }
  reader._resolveClosedPromise(undefined);
  reader._state = 'closed';
}

function CreateReadableStreamCloseFunction(stream) {
  return function() {
    if (stream._state === 'waiting') {
      CloseReadableStream(stream);
    }
    if (stream._state === 'readable') {
      stream._draining = true;
    }
  };
}

function CreateReadableStreamEnqueueFunction(stream) {
  return function(chunk) {
    if (stream._state === 'errored') {
      throw stream._storedError;
    }

    if (stream._state === 'closed') {
      throw new TypeError('stream is closed');
    }

    if (stream._draining === true) {
      throw new TypeError('stream is draining');
    }

    let chunkSize = 1;

    let strategy;
    try {
      strategy = stream._underlyingSource.strategy;
    } catch (strategyE) {
      stream._error(strategyE);
      throw strategyE;
    }

    if (strategy !== undefined) {
      try {
        chunkSize = strategy.size(chunk);
      } catch (chunkSizeE) {
        stream._error(chunkSizeE);
        throw chunkSizeE;
      }
    }

    try {
      EnqueueValueWithSize(stream._queue, chunk, chunkSize);
    } catch (enqueueE) {
      stream._error(enqueueE);
      throw enqueueE;
    }


    const shouldApplyBackpressure = ShouldReadableStreamApplyBackpressure(stream);

    if (stream._state === 'waiting') {
      MarkReadableStreamReadable(stream);
    }

    if (shouldApplyBackpressure === true) {
      return false;
    }
    return true;
  };
}

function CreateReadableStreamErrorFunction(stream) {
  return function(e) {
    if (stream._state === 'closed' || stream._state === 'errored') {
      return;
    }

    if (stream._state === 'readable') {
      stream._queue = [];
    }

    if (IsReadableStreamLocked(stream)) {
      if (stream._state === 'waiting') {
        stream._readableStreamReader._resolveReadyPromise(undefined);
      }

      // rs.ready() was pending because there was a reader.
      stream._resolveReadyPromise(undefined);

      stream._readableStreamReader._rejectClosedPromise(e);

      stream._readableStreamReader._state = 'errored';

      stream._readableStreamReader = undefined;
    } else if (stream._state === 'waiting') {
      stream._resolveReadyPromise(undefined);
    }

    stream._rejectClosedPromise(e);

    stream._storedError = e;
    stream._state = 'errored';

    return undefined;
  };
}

function IsExclusiveStreamReader(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_encapsulatedReadableStream')) {
    return false;
  }

  return true;
}

function IsReadableStreamLocked(stream) {
  assert(IsReadableStream(stream) === true, 'IsReadableStreamLocked should only be used on known readable streams');

  if (stream._readableStreamReader === undefined) {
    return false;
  }

  return true;
}

function IsReadableStream(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_underlyingSource')) {
    return false;
  }

  return true;
}

function MarkReadableStreamReadable(stream) {
  if (IsReadableStreamLocked(stream)) {
    stream._readableStreamReader._resolveReadyPromise(undefined);

    stream._readableStreamReader._state = 'readable';
  } else {
    stream._resolveReadyPromise(undefined);
  }

  stream._state = 'readable';

  return undefined;
}

function MarkReadableStreamWaiting(stream) {
  if (IsReadableStreamLocked(stream)) {
    stream._readableStreamReader._initReadyPromise();

    stream._readableStreamReader._state = 'waiting';
  } else {
    stream._initReadyPromise();
  }

  stream._state = 'waiting';

  return undefined;
}

function ReadFromReadableStream(stream) {
  if (stream._state === 'waiting') {
    throw new TypeError('no chunks available (yet)');
  }
  if (stream._state === 'closed') {
    throw new TypeError('stream has already been consumed');
  }
  if (stream._state === 'errored') {
    throw stream._storedError;
  }

  assert(stream._state === 'readable', "stream state " + stream._state + " is invalid");
  assert(stream._queue.length > 0, 'there must be chunks available to read');

  const chunk = DequeueValue(stream._queue);

  if (stream._queue.length === 0) {
    if (stream._draining === true) {
      CloseReadableStream(stream);
    } else {
      MarkReadableStreamWaiting(stream);
    }
  }

  CallReadableStreamPull(stream);

  return chunk;
}

function ShouldReadableStreamApplyBackpressure(stream) {
  const queueSize = GetTotalQueueSize(stream._queue);
  let shouldApplyBackpressure = queueSize > 1;

  let strategy;
  try {
    strategy = stream._underlyingSource.strategy;
  } catch (strategyE) {
    stream._error(strategyE);
    throw strategyE;
  }

  if (strategy !== undefined) {
    try {
      shouldApplyBackpressure = Boolean(strategy.shouldApplyBackpressure(queueSize));
    } catch (shouldApplyBackpressureE) {
      stream._error(shouldApplyBackpressureE);
      throw shouldApplyBackpressureE;
    }
  }

  return shouldApplyBackpressure;
}
