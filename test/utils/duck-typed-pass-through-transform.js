
'use strict';

var WritableStream = require('../../lib/writable-stream').WritableStream;
var ReadableStream = require('../../lib/readable-stream').ReadableStream;

module.exports = duckTypedPassThroughTransform;

function duckTypedPassThroughTransform() {
  let enqueueInReadable;
  let closeReadable;

  return {
    writable: new WritableStream({
      write: function(chunk) {
        enqueueInReadable(chunk);
      },

      close: function() {
        closeReadable();
      }
    }),

    readable: new ReadableStream({
      start: function(enqueue, close) {
        enqueueInReadable = enqueue;
        closeReadable = close;
      }
    })
  };
}
