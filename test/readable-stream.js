
'use strict';

const test = require('tape-catch');

var ReadableStream = require('../lib/readable-stream.js');
var RandomPushSource = require('./utils/random-push-source').RandomPushSource;
var readableStreamToArray = require('./utils/readable-stream-to-array').readableStreamToArray;
var sequentialReadableStream = require('./utils/sequential-rs').sequentialReadableStream;

test('ReadableStream can be constructed with no arguments', function(t) {
  t.plan(1);
  t.doesNotThrow(function() { return new ReadableStream(); }, 'ReadableStream constructed with no errors');
});

test('ReadableStream instances have the correct methods and properties', function(t) {
  t.plan(9);

  const rs = new ReadableStream();

  t.equal(typeof rs.read, 'function', 'has a read method');
  t.equal(typeof rs.cancel, 'function', 'has an cancel method');
  t.equal(typeof rs.pipeTo, 'function', 'has a pipeTo method');
  t.equal(typeof rs.pipeThrough, 'function', 'has a pipeThrough method');

  t.equal(rs.state, 'waiting', 'state starts out waiting');

  t.ok(rs.ready, 'has a ready property');
  t.ok(rs.ready.then, 'ready property is a thenable');
  t.ok(rs.closed, 'has a closed property');
  t.ok(rs.closed.then, 'closed property is thenable');
});

test('ReadableStream closing puts the stream in a closed state, fulfilling the ready and closed promises with ' +
    'undefined', function(t) {
  t.plan(3);

  const rs = new ReadableStream({
    start: function(enqueue, close) {
      close();
    }
  });

  t.equal(rs.state, 'closed', 'The stream should be in closed state');

  rs.ready.then(
    function(v) { return t.equal(v, undefined, 'ready should return a promise fulfilled with undefined'); },
    function() { return t.fail('ready should not return a rejected promise'); }
  );

  rs.closed.then(
    function(v) { return t.equal(v, undefined, 'closed should return a promise fulfilled with undefined'); },
    function() { return t.fail('closed should not return a rejected promise'); }
  );
});

test('ReadableStream reading a waiting stream throws a TypeError', function(t) {
  t.plan(2);

  const rs = new ReadableStream();

  t.equal(rs.state, 'waiting');
  t.throws(function() { return rs.read(); }, /TypeError/);
});

test('ReadableStream reading a closed stream throws a TypeError', function(t) {
  t.plan(2);

  const rs = new ReadableStream({
    start: function(enqueue, close) {
      close();
    }
  });

  t.equal(rs.state, 'closed');
  t.throws(function() { return rs.read(); }, /TypeError/);
});

test('ReadableStream reading an errored stream throws the stored error', function(t) {
  t.plan(2);

  const passedError = new Error('aaaugh!!');

  const rs = new ReadableStream({
    start: function(enqueue, close, error) {
      error(passedError);
    }
  });

  t.equal(rs.state, 'errored');
  try {
    rs.read();
    t.fail('rs.read() didn\'t throw');
  } catch (e) {
    t.equal(e, passedError);
  }
});

test('ReadableStream reading a stream makes ready and closed return a promise fulfilled with undefined when the ' +
     'stream is fully drained', function(t) {
  t.plan(6);

  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue('test');
      close();
    }
  });

  t.equal(rs.state, 'readable', 'The stream should be in readable state');
  t.equal(rs.read(), 'test', 'A test string should be read');
  t.equal(rs.state, 'closed', 'The stream should be in closed state');

  t.throws(function() { return rs.read(); }, /TypeError/);

  rs.ready.then(
    function(v) { return t.equal(v, undefined, 'ready should return a promise fulfilled with undefined'); },
    function() { return t.fail('ready should not return a rejected promise'); }
  );

  rs.closed.then(
    function(v) { return t.equal(v, undefined, 'closed should return a promise fulfilled with undefined'); },
    function() { return t.fail('closed should not return a rejected promise'); }
  );
});

test('ReadableStream avoid redundant pull call', function(t) {
  var pullCount = 0;
  const rs = new ReadableStream({
    pull: function() {
      pullCount++;
    },

    cancel: function() {
      t.fail('cancel should not be called');
    }
  });

  rs.ready;
  rs.ready;
  rs.ready;

  // Use setTimeout to ensure we run after any promises.
  setTimeout(function() {
    t.equal(pullCount, 1, 'pull should not be called more than once');
    t.end();
  }, 50);
});

test('ReadableStream start throws an error', function(t) {
  t.plan(1);

  const error = new Error('aaaugh!!');

  try {
    new ReadableStream({ start: function() { throw error; } });
    t.fail('Constructor didn\'t throw');
  } catch (caughtError) {
    t.equal(caughtError, error, 'error was allowed to propagate');
  }
});

test('ReadableStream pull throws an error', function(t) {
  t.plan(4);

  const error = new Error('aaaugh!!');
  const rs = new ReadableStream({ pull: function() { throw error; } });

  rs.closed.then(function() {
    t.fail('the stream should not close successfully');
    return t.end();
  });

  rs.ready.then(function(v) {
    t.equal(rs.state, 'errored', 'state is "errored" after waiting');
    t.equal(v, undefined, 'ready fulfills with undefined');
  });

  rs.closed.catch(function(caught)  {
    t.equal(rs.state, 'errored', 'state is "errored" in closed catch');
    t.equal(caught, error, 'error was passed through as rejection reason of closed property');
  });
});

test('ReadableStream adapting a push source', function(t) {
  var pullChecked = false;
  const randomSource = new RandomPushSource(8);

  const rs = new ReadableStream({
    start: function(enqueue, close, error) {
      t.equal(typeof enqueue,  'function', 'enqueue is a function in start');
      t.equal(typeof close, 'function', 'close is a function in start');
      t.equal(typeof error, 'function', 'error is a function in start');

      randomSource.ondata = function(chunk) {
        if (!enqueue(chunk)) {
          randomSource.readStop();
        }
      };

      randomSource.onend = close;
      randomSource.onerror = error;
    },

    pull: function(enqueue, close) {
      if (!pullChecked) {
        pullChecked = true;
        t.equal(typeof enqueue, 'function', 'enqueue is a function in pull');
        t.equal(typeof close, 'function', 'close is a function in pull');
      }

      randomSource.readStart();
    }
  });

  readableStreamToArray(rs).then(function(chunks) {
    t.equal(rs.state, 'closed', 'should be closed');
    t.equal(chunks.length, 8, 'got the expected 8 chunks');
    for (var i = 0; i < chunks.length; i++) {
      t.equal(chunks[i].length, 128, 'each chunk has 128 bytes');
    }

    t.end();
  });
});

test('ReadableStream adapting a sync pull source', function(t) {
  const rs = sequentialReadableStream(10);

  readableStreamToArray(rs).then(function(chunks) {
    t.equal(rs.state, 'closed', 'stream should be closed');
    t.equal(rs.source.closed, true, 'source should be closed');
    t.deepEqual(chunks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'got the expected 10 chunks');

    t.end();
  });
});

test('ReadableStream adapting an async pull source', function(t) {
  const rs = sequentialReadableStream(10, { async: true });

  readableStreamToArray(rs).then(function(chunks) {
    t.equal(rs.state, 'closed', 'stream should be closed');
    t.equal(rs.source.closed, true, 'source should be closed');
    t.deepEqual(chunks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'got the expected 10 chunks');

    t.end();
  });
});

test('ReadableStream is able to enqueue lots of data in a single pull, making it available synchronously', function(t) {
  let i = 0;
  const rs = new ReadableStream({
    pull: function(enqueue, close) {
      while (++i <= 10) {
        enqueue(i);
      }

      close();
    }
  });

  rs.ready.then(function() {
    const data = [];
    while (rs.state === 'readable') {
      data.push(rs.read());
    }

    t.deepEqual(data, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    t.end();
  });
});

test('ReadableStream does not call pull until previous pull\'s promise fulfills', function(t) {
  let resolve;
  let returnedPromise;
  let timesCalled = 0;
  const rs = new ReadableStream({
    pull: function(enqueue) {
      ++timesCalled;
      enqueue(timesCalled);
      returnedPromise = new Promise(function(r) { resolve = r; });
      return returnedPromise;
    }
  });

  t.equal(rs.state, 'waiting', 'stream starts out waiting');

  rs.ready.then(function() {
    t.equal(rs.state, 'readable', 'stream becomes readable (even before promise fulfills)');
    t.equal(timesCalled, 1, 'pull is not yet called a second time');
    t.equal(rs.read(), 1, 'read() returns enqueued value');

    setTimeout(function() {
      t.equal(timesCalled, 1, 'after 30 ms, pull has still only been called once');

      resolve();

      returnedPromise.then(function() {
        t.equal(timesCalled, 2, 'after the promise is fulfilled, pull is called a second time');
        t.equal(rs.read(), 2, 'read() returns the second enqueued value');
        t.end();
      });
    }, 30);
  });
});

test('ReadableStream does not call pull multiple times after previous pull finishes', function(t) {
  let timesCalled = 0;

  const rs = new ReadableStream({
    start: function(enqueue) {
      enqueue('a');
      enqueue('b');
      enqueue('c');
    },
    pull: function() {
      ++timesCalled;
    },
    strategy: {
      size: function() {
        return 1;
      },
      shouldApplyBackpressure: function() {
        return false;
      }
    }
  });

  t.equal(rs.state, 'readable', 'since start() synchronously enqueued chunks, the stream is readable');

  // Wait for start to finish
  rs.ready.then(function() {
    t.equal(rs.read(), 'a', 'first chunk should be as expected');
    t.equal(rs.read(), 'b', 'second chunk should be as expected');
    t.equal(rs.read(), 'c', 'third chunk should be as expected');

    setTimeout(function() {
      // Once for after start, and once for after rs.read() === 'a'.
      t.equal(timesCalled, 2, 'pull() should only be called twice');
      t.end();
    }, 50);
  });
});

test('ReadableStream pull rejection makes stream errored', function(t) {
  t.plan(2);

  const theError = new Error('pull failure');
  const rs = new ReadableStream({
    pull: function() {
      return Promise.reject(theError);
    }
  });

  t.equal(rs.state, 'waiting', 'stream starts out waiting');

  rs.closed.then(
    function() {
      return t.fail('.closed should not fulfill'), function(e) { t.equal(e, theError, '.closed should reject with the error'); };
    }
  );
});

test('ReadableStream ready does not error when no more data is available', function(t) {
  // https://github.com/whatwg/streams/issues/80

  t.plan(1);

  const rs = sequentialReadableStream(5, { async: true });
  const result = [];

  pump();

  function pump() {
    while (rs.state === 'readable') {
      result.push(rs.read());
    }

    if (rs.state === 'closed') {
      t.deepEqual(result, [1, 2, 3, 4, 5], 'got the expected 5 chunks');
    } else {
      rs.ready.then(pump, function(r) { return t.ifError(r); });
    }
  }
});

test('ReadableStream should be able to get data sequentially from an asynchronous stream', function(t) {
  // https://github.com/whatwg/streams/issues/80

  t.plan(4);

  const rs = sequentialReadableStream(3, { async: true });

  const result = [];
  const EOF = Object.create(null);

  getNext().then(function(v) {
    t.equal(v, 1, 'first chunk should be 1');
    return getNext().then(function(v) {
      t.equal(v, 2, 'second chunk should be 2');
      return getNext().then(function(v) {
        t.equal(v, 3, 'third chunk should be 3');
        return getNext().then(function(v) {
          t.equal(v, EOF, 'fourth result should be EOF');
        });
      });
    });
  })
    .catch(function(r) { return t.ifError(r); });

  function getNext() {
    if (rs.state === 'closed') {
      return Promise.resolve(EOF);
    }

    return rs.ready.then(function() {
      if (rs.state === 'readable') {
        return rs.read();
      } else if (rs.state === 'closed') {
        return EOF;
      }
    });
  }
});

test('Default ReadableStream returns `false` for all but the first `enqueue` call', function(t) {
  t.plan(5);

  new ReadableStream({
    start: function(enqueue) {
      t.equal(enqueue('hi'), true);
      t.equal(enqueue('hey'), false);
      t.equal(enqueue('whee'), false);
      t.equal(enqueue('yo'), false);
      t.equal(enqueue('sup'), false);
    }
  });
});

test('ReadableStream continues returning `true` from `enqueue` if the data is read out of it in time', function(t) {
  t.plan(12);

  const rs = new ReadableStream({
    start: function(enqueue) {
      // Delay a bit so that the stream is successfully constructed and thus the `rs` variable references something.
      setTimeout(function() {
        t.equal(enqueue('foo'), true);
        t.equal(rs.state, 'readable');
        t.equal(rs.read(), 'foo');
        t.equal(rs.state, 'waiting');

        t.equal(enqueue('bar'), true);
        t.equal(rs.state, 'readable');
        t.equal(rs.read(), 'bar');
        t.equal(rs.state, 'waiting');

        t.equal(enqueue('baz'), true);
        t.equal(rs.state, 'readable');
        t.equal(rs.read(), 'baz');
        t.equal(rs.state, 'waiting');
      }, 0);
    },
    strategy: new CountQueuingStrategy({ highWaterMark: 4 })
  });
});

test('ReadableStream enqueue fails when the stream is draining', function(t) {
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      t.equal(enqueue('a'), true);
      close();

      t.throws(
        function() { return enqueue('b'); },
          /TypeError/,
        'enqueue after close must throw a TypeError'
      );
    },
    strategy: new CountQueuingStrategy({ highWaterMark: 10 })
  });

  t.equal(rs.state, 'readable');
  t.equal(rs.read(), 'a');
  t.equal(rs.state, 'closed');
  t.end();
});

test('ReadableStream enqueue fails when the stream is closed', function(t) {
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      close();

      t.throws(
        function() { return enqueue('a'); },
        /TypeError/,
        'enqueue after close must throw a TypeError'
      );
    }
  });

  t.equal(rs.state, 'closed');
  t.end();
});

test('ReadableStream enqueue fails with the correct error when the stream is errored', function(t) {
  const expectedError = new Error('i am sad');
  const rs = new ReadableStream({
    start: function(enqueue, close, error) {
      error(expectedError);

      t.throws(
        function() { return enqueue('a'); },
        /i am sad/,
        'enqueue after error must throw that error'
      );
    }
  });

  t.equal(rs.state, 'errored');
  t.end();
});

test('ReadableStream if shouldApplyBackpressure throws, the stream is errored', function(t) {
  const error = new Error('aaaugh!!');

  const rs = new ReadableStream({
    start: function(enqueue) {
      try {
        enqueue('hi');
        t.fail('enqueue didn\'t throw');
        t.end();
      } catch (e) {
        t.equal(e, error);
      }
    },
    strategy: {
      size: function() {
        return 1;
      },

      shouldApplyBackpressure: function() {
        throw error;
      }
    }
  });

  rs.closed.catch(function(r) {
    t.equal(r, error);
    t.end();
  });
});

test('ReadableStream if size throws, the stream is errored', function(t) {
  const error = new Error('aaaugh!!');

  const rs = new ReadableStream({
    start: function(enqueue) {
      try {
        enqueue('hi');
        t.fail('enqueue didn\'t throw');
        t.end();
      } catch (e) {
        t.equal(e, error);
      }
    },
    strategy: {
      size: function() {
        throw error;
      },

      shouldApplyBackpressure: function() {
        return true;
      }
    }
  });

  rs.closed.catch(function(r) {
    t.equal(r, error);
    t.end();
  });
});

test('ReadableStream if size is NaN, the stream is errored', function(t) {
  t.plan(2);

  const rs = new ReadableStream({
    start: function(enqueue) {
      try {
        enqueue('hi');
        t.fail('enqueue didn\'t throw');
      } catch (error) {
        t.equal(error.constructor, RangeError);
      }
    },
    strategy: {
      size: function() {
        return NaN;
      },

      shouldApplyBackpressure: function() {
        return true;
      }
    }
  });

  t.equal(rs.state, 'errored', 'state should be errored');
});

test('ReadableStream if size is -Infinity, the stream is errored', function(t) {
  t.plan(2);

  const rs = new ReadableStream({
    start: function(enqueue) {
      try {
        enqueue('hi');
        t.fail('enqueue didn\'t throw');
      } catch (error) {
        t.equal(error.constructor, RangeError);
      }
    },
    strategy: {
      size: function() {
        return -Infinity;
      },

      shouldApplyBackpressure: function() {
        return true;
      }
    }
  });

  t.equal(rs.state, 'errored', 'state should be errored');
});

test('ReadableStream if size is +Infinity, the stream is errored', function(t) {
  t.plan(2);

  const rs = new ReadableStream({
    start: function(enqueue) {
      try {
        enqueue('hi');
        t.fail('enqueue didn\'t throw');
      } catch (error) {
        t.equal(error.constructor, RangeError);
      }
    },
    strategy: {
      size: function() {
        return +Infinity;
      },

      shouldApplyBackpressure: function() {
        return true;
      }
    }
  });

  t.equal(rs.state, 'errored', 'state should be errored');
});

test('ReadableStream errors in shouldApplyBackpressure cause ready to fulfill and closed to rejected', function(t) {
  t.plan(3);

  const thrownError = new Error('size failure');
  let callsToShouldApplyBackpressure = 0;
  const rs = new ReadableStream({
    start: function(enqueue) {
      setTimeout(function() {
        try {
          enqueue('hi');
          t.fail('enqueue didn\'t throw');
        } catch (error) {
          t.equal(error, thrownError, 'error thrown by enqueue should be the thrown error');
        }
      }, 0);
    },
    strategy: {
      size: function() {
        return 1;
      },
      shouldApplyBackpressure: function() {
        if (++callsToShouldApplyBackpressure === 2) {
          throw thrownError;
        }

        return false;
      }
    }
  });

  rs.ready.then(
    function(v) { return t.equal(v, undefined, 'ready should be fulfilled with undefined'); },
    function(e) { t.fail('ready should not be rejected'); }
  );

  rs.closed.then(
    function(v) {
      return t.fail('closed should not be fulfilled'),
      function(e) { t.equal(e, thrownError, 'closed should be rejected with the thrown error'); };
    }
  );
});

test('ReadableStream cancel() and closed on a closed stream should return the same promise', function(t) {
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      close();
    }
  });

  t.equal(rs.cancel(), rs.closed, 'the promises returned should be the same');
  t.end();
});

test('ReadableStream ready returns the same value when called on a new, empty stream', function(t) {
  const rs = new ReadableStream();
  t.equal(rs.ready, rs.ready, 'rs.ready should not change between gets');
  t.end();
});

test('ReadableStream ready returns the same value when called on a readable stream', function(t) {
  const rs = new ReadableStream({
    start: function(enqueue) {
      enqueue('a');
    }
  });

  t.equal(rs.ready, rs.ready, 'rs.ready should not change between gets');
  t.end();
});

test('ReadableStream cancel() and closed on an errored stream should return the same promise', function(t) {
  const rs = new ReadableStream({
    start: function(enqueue, close, error) {
      error(new Error('boo!'));
    }
  });

  t.equal(rs.cancel(), rs.closed, 'the promises returned should be the same');
  t.end();
});

test('ReadableStream should call underlying source methods as methods', function(t) {
  t.plan(6);

  var theSource;

  function Source() {}

  Source.prototype = Object.define(null, {
    start: {
      value: function(enqueue) {
        t.equal(this, theSource, 'start() should be called with the correct this');
        enqueue('a');
      }
    },

    pull: {
      value: function() {
        t.equal(this, theSource, 'pull() should be called with the correct this');
      }
    },

    cancel: {
      value: function() {
        t.equal(this, theSource, 'cancel() should be called with the correct this');
      }
    },

    strategy: {
      get: function() {
        // Called three times
        t.equal(this, theSource, 'strategy getter should be called with the correct this');
        return undefined;
      }
    }
  });

  theSource = new Source();
  theSource.debugName = "the source object passed to the constructor";
  const rs = new ReadableStream(theSource);

  rs.ready.then(function() { return rs.cancel(); });
});
