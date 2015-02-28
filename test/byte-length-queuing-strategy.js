
'use strict';

var ByteLengthQueuingStrategy = require('../lib/byte-length-queuing-strategy');

var WritableStream = require('../lib/writable-stream').WritableStream;

const test = require('tape-catch');

test('Can construct a ByteLengthQueuingStrategy with a valid high water mark', function(t) {
  const strategy = new ByteLengthQueuingStrategy({ highWaterMark: 4 });

  t.end();
});

test('Closing a writable stream with in-flight writes below the high water mark delays the close call properly', function(t) {
  t.plan(1);

  let isDone = false;
  const ws = new WritableStream({
    write: function(chunk) {
      return new Promise(function(resolve) {
        setTimeout(function() {
          isDone = true;
          resolve();
        }, 200);
      });
    },

    close: function() {
      t.true(isDone, 'close is only called once the promise has been resolved');
    },

    strategy: new ByteLengthQueuingStrategy({ highWaterMark: 1024 * 16 })
  });

  ws.write({ byteLength: 1024 });
  ws.close();
});
