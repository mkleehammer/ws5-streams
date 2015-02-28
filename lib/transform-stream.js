
'use strict';

var WritableStream = require('../lib/writable-stream').WritableStream;
var ReadableStream = require('../lib/readable-stream').ReadableStream;

exports.TransformStream = TransformStream;

function TransformStream(options) {
  options = options || {};

  var transform = options.transform;
  if (typeof transform !== 'function') {
    throw new TypeError('transform must be a function');
  }

  var flush = options.flush;
  if (!flush) {
    flush = function defaultFlush(enqueue, close) { close(); };
  }

  var writableStrategy = options.writableStrategy;
  var readableStrategy = options.readableStrategy;

  let writeChunk, writeDone, errorWritable;
  let transforming = false;
  let chunkWrittenButNotYetTransformed = false;
  this.writable = new WritableStream({
    start: function(error) {
      errorWritable = error;
    },
    write: function(chunk) {
      writeChunk = chunk;
      chunkWrittenButNotYetTransformed = true;

      const p = new Promise(function(resolve) { writeDone = resolve; });
      if (readable.state === 'waiting') {
        maybeDoTransform();
      }
      return p;
    },
    close: function() {
      try {
        flush(enqueueInReadable, closeReadable);
      } catch (e) {
        errorWritable(e);
        errorReadable(e);
      }
    },
    strategy: writableStrategy
  });

  var enqueueInReadable, closeReadable, errorReadable;
  const readable = this.readable = new ReadableStream({
    start: function(enqueue, close, error) {
      enqueueInReadable = enqueue;
      closeReadable = close;
      errorReadable = error;
    },
    pull: function() {
      if (chunkWrittenButNotYetTransformed === true) {
        maybeDoTransform();
      }
    },
    strategy: readableStrategy
  });

  function maybeDoTransform() {
    if (transforming === false) {
      transforming = true;
      try {
        transform(writeChunk, enqueueInReadable, transformDone);
      } catch (e) {
        transforming = false;
        errorWritable(e);
        errorReadable(e);
      }
    }
  }

  function transformDone() {
    transforming = false;
    chunkWrittenButNotYetTransformed = false;
    writeDone();
  }
}

