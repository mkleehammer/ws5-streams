
'use strict';

const test = require('tape-catch');

var WritableStream = require('../lib/writable-stream').WritableStream;
var ReadableStream = require('../lib/readable-stream').ReadableStream;
var CountQueuingStrategy = require('../lib/count-queuing-strategy');

var sequentialReadableStream = require('./utils/sequential-rs');

test('Piping from a ReadableStream from which lots of data are readable synchronously', function(t) {
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      for (let i = 0; i < 1000; ++i) {
        enqueue(i);
      }
      close();
    }
  });
  t.equal(rs.state, 'readable');

  const ws = new WritableStream({
    strategy: new CountQueuingStrategy({
      highWaterMark: 1000
    })
  });
  t.equal(ws.state, 'writable');

  rs.pipeTo(ws);
  t.equal(rs.state, 'closed', 'all data must be read out from rs');
  t.equal(ws.state, 'closing', 'close must have been called after accepting all data from rs');

  t.end();
});

test('Piping from a ReadableStream in readable state to a WritableStream in closing state', function(t) {
  let pullCount = 0;
  let cancelCalled = false;
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue("Hello");
    },
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.assert(!cancelCalled);
      cancelCalled = true;
    }
  });
  t.equal(rs.state, 'readable');

  const ws = new WritableStream({
    write: function() {
      t.fail('Unexpected write call');
      t.end();
    },
    abort: function() {
      t.fail('Unexpected abort call');
      t.end();
    }
  });

  ws.close();
  t.equal(ws.state, 'closing');

  rs.pipeTo(ws);
  t.assert(cancelCalled);
  t.equal(rs.state, 'closed');
  t.end();
});

test('Piping from a ReadableStream in readable state to a WritableStream in errored state', function(t) {
  let pullCount = 0;
  let cancelCalled = false;
  const passedError = new Error('horrible things');
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue("Hello");
    },
    pull: function() {
      ++pullCount;
    },
    cancel: function(reason) {
      t.assert(!cancelCalled, 'cancel must not be called more than once');
      cancelCalled = true;

      t.equal(reason, passedError);
    }
  });
  t.equal(rs.state, 'readable');

  let writeCalled = false;
  const ws = new WritableStream({
    write: function(chunk) {
      t.assert(!writeCalled, 'write must not be called more than once');
      writeCalled = true;

      t.equal(chunk, 'Hello');

      return Promise.reject(passedError);
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    },
    abort: function() {
      t.fail('Unexpected abort call');
      t.end();
    }
  });

  // Wait for ws to start.
  setTimeout(function() {
    ws.write('Hello');
    t.assert(writeCalled, 'write must be called');

    ws.ready.then(function() {
      t.equal(ws.state, 'errored', 'as a result of rejected promise, ws must be in errored state');

      rs.pipeTo(ws);

      // Need to delay because pipeTo retrieves error from dest using ready.
      setTimeout(function() {
        t.assert(cancelCalled);
        t.equal(rs.state, 'closed');
        t.end();
      }, 0);
    });
  }, 0);
});

test('Piping from a ReadableStream in closed state to a WritableStream in writable state', function(t) {
  t.plan(3);

  const rs = new ReadableStream({
    start: function(enqueue, close) {
      close();
    },
    pull: function() {
      t.fail('Unexpected pull call');
    },
    cancel: function(reason) {
      t.fail('Unexpected cancel call');
    }
  });
  t.equal(rs.state, 'closed');

  const ws = new WritableStream({
    write: function() {
      t.fail('Unexpected write call');
    },
    close: function() {
      t.fail('Unexpected close call');
    },
    abort: function() {
      t.fail('Unexpected abort call');
    }
  });

  // Wait for ws to start.
  setTimeout(function() {
    t.equal(ws.state, 'writable');

    rs.pipeTo(ws).then(
      function() { t.fail('pipeTo promise should not be fulfilled'); },
      function(e) { t.equal(e.constructor, TypeError, 'pipeTo promise should be rejected with a TypeError'); }
    );
  }, 0);
});

test('Piping from a ReadableStream in errored state to a WritableStream in writable state', function(t) {
  t.plan(3);

  const theError = new Error('piping is too hard today');
  const rs = new ReadableStream({
    start: function(enqueue, close, error) {
      error(theError);
    },
    pull: function() {
      t.fail('Unexpected pull call');
    },
    cancel: function(reason) {
      t.fail('Unexpected cancel call');
    }
  });
  t.equal(rs.state, 'errored');

  const ws = new WritableStream({
    write: function() {
      t.fail('Unexpected write call');
    },
    close: function() {
      t.fail('Unexpected close call');
    },
    abort: function() {
      t.fail('Unexpected abort call');
    }
  });

  // Wait for ws to start.
  setTimeout(function() {
    t.equal(ws.state, 'writable');

    rs.pipeTo(ws).then(
      function() { t.fail('pipeTo promise should not be fulfilled'); },
      function(e) { t.equal(e, theError, 'pipeTo promise should be rejected with the passed error'); }
    );
  }, 0);
});

test('Piping from a ReadableStream in readable state which becomes closed after pipeTo call to a WritableStream in ' +
    'writable state', function(t) {
  let closeReadableStream;
  let pullCount = 0;
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue('Hello');
      closeReadableStream = close;
    },
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.fail('Unexpected cancel call');
      t.end();
    }
  });
  t.equal(rs.state, 'readable');

  let writeCalled = false;
  const ws = new WritableStream({
    write: function(chunk) {
      if (!writeCalled) {
        t.equal(chunk, 'Hello');
        writeCalled = true;
      } else {
        t.fail('Unexpected extra write call');
        t.end();
      }
    },
    close: function() {
      t.assert(writeCalled);
      t.equal(pullCount, 2);

      t.end();
    },
    abort: function() {
      t.fail('Unexpected abort call');
      t.end();
    }
  });

  // Wait for ws to start.
  setTimeout(function() {
    rs.pipeTo(ws);
    t.equal(rs.state, 'waiting', 'value must leave readable state synchronously');
    t.equal(ws.state, 'waiting', 'writable stream must be written to, entering a waiting state');

    closeReadableStream();
  }, 0);
});

test('Piping from a ReadableStream in readable state which becomes errored after pipeTo call to a WritableStream in ' +
    'writable state', function(t) {
  let errorReadableStream;
  let pullCount = 0;
  const rs = new ReadableStream({
    start: function(enqueue, close, error) {
      enqueue("Hello");
      errorReadableStream = error;
    },
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.fail('Unexpected cancel call');
      t.end();
    }
  });
  t.equal(rs.state, 'readable');

  let writeCalled = false;
  let passedError = new Error('horrible things');
  const ws = new WritableStream({
    write: function(chunk) {
      if (!writeCalled) {
        t.equal(chunk, 'Hello');
        writeCalled = true;
      } else {
        t.fail('Unexpected extra write call');
        t.end();
      }
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    },
    abort: function(reason) {
      t.equal(reason, passedError);
      t.assert(writeCalled);
      t.equal(pullCount, 2);

      t.end();
    }
  });

  // Wait for ws to start.
  setTimeout(function() {
    rs.pipeTo(ws);
    t.equal(rs.state, 'waiting', 'value must leave readable state synchronously');
    t.equal(ws.state, 'waiting', 'writable stream must be written to, entering a waiting state');

    errorReadableStream(passedError);
  }, 0);
});

test('Piping from a ReadableStream in waiting state which becomes readable after pipeTo call to a WritableStream in ' +
    'writable state', function(t) {
  let enqueue;
  let pullCount = 0;
  const rs = new ReadableStream({
    start: function(enqueue_) {
      enqueue = enqueue_;
    },
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.fail('Unexpected cancel call');
      t.end();
    }
  });

  const ws = new WritableStream({
    write: function(chunk) {
      t.equal(chunk, 'Hello');
      t.equal(pullCount, 2);
      t.end();
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    },
    abort: function(reason) {
      t.fail('Unexpected abort call');
      t.end();
    }
  });

  rs.pipeTo(ws);
  t.equal(rs.state, 'waiting');
  t.equal(ws.state, 'writable');

  enqueue('Hello');
});

test('Piping from a ReadableStream in waiting state which becomes errored after pipeTo call to a WritableStream in ' +
    'writable state', function(t) {
  t.plan(4);

  let errorReadableStream;
  const rs = new ReadableStream({
    start: function(enqueue, close, error) {
      errorReadableStream = error;
    },
    pull: function() {
      t.fail('Unexpected pull call');
      t.end();
    },
    cancel: function() {
      t.fail('Unexpected cancel call');
      t.end();
    }
  });

  const passedError = new Error('horrible things');
  const ws = new WritableStream({
    write: function() {
      t.fail('Unexpected write call');
      t.end();
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    },
    abort: function(reason) {
      t.equal(reason, passedError);
    }
  });

  rs.pipeTo(ws);
  t.equal(rs.state, 'waiting');
  t.equal(ws.state, 'writable');

  errorReadableStream(passedError);
  t.equal(rs.state, 'errored');
});

test('Piping from a ReadableStream in waiting state to a WritableStream in writable state which becomes errored ' +
    'after pipeTo call', function(t) {
  let writeCalled = false;

  let pullCount = 0;
  const rs = new ReadableStream({
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.equal(pullCount, 1, 'pull should have been called once by cancel-time');
      t.assert(writeCalled, 'write should have been called by cancel-time');
      t.end();
    }
  });

  let errorWritableStream;
  const ws = new WritableStream({
    start: function(error) {
      errorWritableStream = error;
    },
    write: function(chunk) {
      t.assert(!writeCalled, 'write should not have been called more than once');
      writeCalled = true;

      t.equal(chunk, 'Hello', 'the chunk passed to write should be the one written');
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    },
    abort: function() {
      t.fail('Unexpected abort call');
      t.end();
    }
  });
  // Needed to prepare errorWritableStream
  ws.write('Hello');

  // Wait for ws to start.
  setTimeout(function() {
    t.equal(ws.state, 'writable', 'ws should start writable');

    rs.pipeTo(ws);
    t.equal(rs.state, 'waiting', 'rs should be waiting after pipe');
    t.equal(ws.state, 'writable', 'ws should be writable after pipe');

    errorWritableStream();
    t.equal(ws.state, 'errored', 'ws should be errored after erroring it');
  }, 0);
});

test('Piping from a ReadableStream in readable state to a WritableStream in waiting state which becomes writable ' +
    'after pipeTo call', function(t) {
  let enqueue;
  let pullCount = 0;
  const rs = new ReadableStream({
    start: function(enqueue) {
      enqueue('World');
    },
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.fail('Unexpected cancel call');
      t.end();
    }
  });
  t.equal(rs.state, 'readable');

  let resolveWritePromise;
  const ws = new WritableStream({
    write: function(chunk) {
      if (!resolveWritePromise) {
        t.equal(chunk, 'Hello');
        return new Promise(function(resolve) { resolveWritePromise = resolve; });
      } else {
        t.equal(chunk, 'World');

        t.equal(pullCount, 2);

        t.end();
      }
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    },
    abort: function() {
      t.fail('Unexpected abort call');
      t.end();
    }
  });
  ws.write('Hello');

  // Wait for ws to start.
  setTimeout(function() {
    t.equal(ws.state, 'waiting');

    rs.pipeTo(ws);
    t.equal(rs.state, 'waiting', 'readable stream must say it is waitable while piping (even with a nonempty queue)');
    t.equal(ws.state, 'waiting');

    resolveWritePromise();
    ws.ready.then(function() {
      t.equal(ws.state, 'writable');
    })
    .catch(t.error);
  }, 0);
});

test('Piping from a ReadableStream in readable state to a WritableStream in waiting state which becomes errored ' +
    'after pipeTo call', function(t) {
  let writeCalled = false;

  let enqueue;
  let pullCount = 0;
  const rs = new ReadableStream({
    start: function(enqueue) {
      enqueue('World');
    },
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.assert(writeCalled);
      t.equal(pullCount, 1);
      t.end();
    }
  });
  t.equal(rs.state, 'readable');

  let errorWritableStream;
  const ws = new WritableStream({
    start: function(error) {
      errorWritableStream = error;
    },
    write: function(chunk) {
      t.assert(!writeCalled);
      t.equal(chunk, 'Hello');
      writeCalled = true;
      return new Promise(function() {});
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    },
    abort: function() {
      t.fail('Unexpected abort call');
      t.end();
    }
  });
  ws.write('Hello');

  // Wait for ws to start.
  setTimeout(function() {
    t.equal(ws.state, 'waiting');

    t.equal(rs.state, 'readable', 'readable stream should be readable before piping starts');
    rs.pipeTo(ws);
    t.equal(rs.state, 'waiting', 'readable stream must say it is waitable while piping (even with a nonempty queue)');
    t.equal(ws.state, 'waiting');

    errorWritableStream();
    t.equal(ws.state, 'errored');
  }, 0);
});

test('Piping from a ReadableStream in readable state which becomes errored after pipeTo call to a WritableStream in ' +
    'waiting state', function(t) {
  t.plan(10);

  let errorReadableStream;
  let pullCount = 0;
  const rs = new ReadableStream({
    start: function(enqueue, close, error) {
      enqueue('World');
      errorReadableStream = error;
    },
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.fail('Unexpected cancel call');
      t.end();
    }
  });
  t.equal(rs.state, 'readable');

  let writeCalled = false;
  const ws = new WritableStream({
    write: function(chunk) {
      t.assert(!writeCalled);
      writeCalled = true;

      t.equal(chunk, 'Hello');

      return new Promise(function() {});
    },
    close: function() {
      t.fail('Unexpected close call');
    },
    abort: function() {
      t.pass('underlying source abort was called');
    }
  });
  ws.write('Hello');

  // Wait for ws to start.
  setTimeout(function() {
    t.equal(ws.state, 'waiting');
    t.equal(pullCount, 1);

    t.equal(rs.state, 'readable', 'readable stream should be readable before piping starts');
    rs.pipeTo(ws);
    t.equal(rs.state, 'waiting', 'readable stream must say it is waitable while piping (even with a nonempty queue)');
    t.equal(ws.state, 'waiting');

    errorReadableStream();
    t.equal(rs.state, 'errored');
  }, 0);
});

test('Piping from a ReadableStream in waiting state to a WritableStream in waiting state where both become ready ' +
    'after pipeTo', function(t) {
  let enqueue;
  let pullCount = 0;
  const rs = new ReadableStream({
    start: function(enqueue_) {
      enqueue = enqueue_;
    },
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.fail('Unexpected cancel call');
      t.end();
    }
  });

  let checkSecondWrite = false;

  let resolveWritePromise;
  const ws = new WritableStream({
    write: function(chunk) {
      if (checkSecondWrite) {
        t.equal(chunk, 'Goodbye');
        t.end();
      } else {
        t.assert(!resolveWritePromise);
        t.equal(chunk, 'Hello');
        return new Promise(function(resolve) { resolveWritePromise = resolve; });
      }
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    },
    abort: function(reason) {
      t.fail('Unexpected abort call');
      t.end();
    }
  });
  ws.write('Hello');

  // Wait for ws to start.
  setTimeout(function() {
    t.assert(resolveWritePromise);
    t.equal(ws.state, 'waiting');

    rs.pipeTo(ws);

    enqueue('Goodbye');

    // Check that nothing happens before calling done(), and then call done()
    // to check that pipeTo is woken up.
    setTimeout(function() {
      t.equal(pullCount, 1);

      checkSecondWrite = true;

      resolveWritePromise();
    }, 100);
  }, 0);
});

test('Piping from a ReadableStream in waiting state to a WritableStream in waiting state which becomes writable ' +
    'after pipeTo call', function(t) {
  let pullCount = 0;
  const rs = new ReadableStream({
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.fail('Unexpected cancel call');
      t.end();
    }
  });

  let resolveWritePromise;
  const ws = new WritableStream({
    write: function(chunk) {
      t.assert(!resolveWritePromise);
      t.equal(chunk, 'Hello');
      return new Promise(function(resolve) { resolveWritePromise = resolve; });
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    },
    abort: function(reason) {
      t.fail('Unexpected abort call');
      t.end();
    }
  });
  ws.write('Hello');

  // Wait for ws to start.
  setTimeout(function() {
    t.equal(ws.state, 'waiting');

    rs.pipeTo(ws);
    t.equal(rs.state, 'waiting');
    t.equal(ws.state, 'waiting');

    resolveWritePromise();
    // Check that nothing happens.
    setTimeout(function() {
      t.equal(pullCount, 1);

      t.end();
    }, 100);
  }, 0);
});

test('Piping from a ReadableStream in waiting state which becomes closed after pipeTo call to a WritableStream in ' +
    'waiting state', function(t) {
  t.plan(5);

  let closeReadableStream;
  let pullCount = 0;
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      closeReadableStream = close;
    },
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.fail('Unexpected cancel call');
      t.end();
    }
  });

  let writeCalled = false;
  const ws = new WritableStream({
    write: function(chunk) {
      if (!writeCalled) {
        t.equal(chunk, 'Hello');
        writeCalled = true;
      } else {
        t.fail('Unexpected extra write call');
        t.end();
      }
      return new Promise(function() {});
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    },
    abort: function(reason) {
      t.fail('Unexpected abort call');
      t.end();
    }
  });
  ws.write('Hello');

  // Wait for ws to start.
  setTimeout(function() {
    t.equal(ws.state, 'waiting');

    rs.pipeTo(ws);

    closeReadableStream();

    t.equal(rs.state, 'closed');

    // Check that nothing happens.
    setTimeout(function() {
      t.equal(ws.state, 'closing');

      t.equal(pullCount, 1);
    }, 100);
  });
});

test('Piping from a ReadableStream in waiting state which becomes errored after pipeTo call to a WritableStream in ' +
    'waiting state', function(t) {
  t.plan(6);

  let errorReadableStream;
  let pullCount = 0;
  const rs = new ReadableStream({
    start: function(enqueue, close, error) {
      errorReadableStream = error;
    },
    pull: function() {
      ++pullCount;
    },
    cancel: function() {
      t.fail('Unexpected cancel call');
      t.end();
    }
  });

  let writeCalled = false;
  const passedError = new Error('horrible things');
  const ws = new WritableStream({
    write: function(chunk) {
      if (!writeCalled) {
        t.equal(chunk, 'Hello');
        writeCalled = true;
      } else {
        t.fail('Unexpected extra write call');
        t.end();
      }
      return new Promise(function() {});
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    },
    abort: function(reason) {
      t.equal(reason, passedError);
      t.assert(writeCalled);
      t.equal(pullCount, 1);
    }
  });
  ws.write('Hello');

  // Wait for ws to start.
  setTimeout(function() {
    t.equal(ws.state, 'waiting');

    rs.pipeTo(ws);

    errorReadableStream(passedError);

    t.equal(rs.state, 'errored');
  });
});

test('Piping to a duck-typed asynchronous "writable stream" works', function(t) {
  // https://github.com/whatwg/streams/issues/80

  t.plan(1);

  const rs = sequentialReadableStream(5, { async: true });

  const chunksWritten = [];
  const dest = {
    state: 'writable',
    write: function(chunk) {
      chunksWritten.push(chunk);
      return Promise.resolve();
    },
    get ready() {
      return Promise.resolve();
    },
    close: function() {
      t.deepEqual(chunksWritten, [1, 2, 3, 4, 5]);
      return Promise.resolve();
    },
    abort: function() {
      t.fail('Should not call abort');
    },
    closed: new Promise(function() {})
  };

  rs.pipeTo(dest);
});

test('Piping to a stream that has been aborted passes through the error as the cancellation reason', function(t) {
  let recordedReason;
  const rs = new ReadableStream({
    cancel: function(reason) {
      recordedReason = reason;
    }
  });

  const ws = new WritableStream();
  const passedReason = new Error('I don\'t like you.');
  ws.abort(passedReason);

  rs.pipeTo(ws);

  setTimeout(function() {
    t.equal(recordedReason, passedReason, 'the recorded cancellation reason must be the passed abort reason');
    t.end();
  }, 10);
});

test('Piping to a stream and then aborting it passes through the error as the cancellation reason', function(t) {
  let recordedReason;
  const rs = new ReadableStream({
    cancel: function(reason) {
      recordedReason = reason;
    }
  });

  const ws = new WritableStream();
  const passedReason = new Error('I don\'t like you.');

  rs.pipeTo(ws);
  ws.abort(passedReason);

  setTimeout(function() {
    t.equal(recordedReason, passedReason, 'the recorded cancellation reason must be the passed abort reason');
    t.end();
  }, 10);
});

test('Piping to a stream that has been closed propagates a TypeError cancellation reason backward', function(t) {
  let recordedReason;
  const rs = new ReadableStream({
    cancel: function(reason) {
      recordedReason = reason;
    }
  });

  const ws = new WritableStream();
  ws.close();

  rs.pipeTo(ws);

  setTimeout(function() {
    t.equal(recordedReason.constructor, TypeError, 'the recorded cancellation reason must be a TypeError');
    t.end();
  }, 10);
});

test('Piping to a stream and then closing it propagates a TypeError cancellation reason backward', function(t) {
  let recordedReason;
  const rs = new ReadableStream({
    cancel: function(reason) {
      recordedReason = reason;
    }
  });

  const ws = new WritableStream();

  rs.pipeTo(ws);
  ws.close();

  setTimeout(function() {
    t.equal(recordedReason.constructor, TypeError, 'the recorded cancellation reason must be a TypeError');
    t.end();
  }, 10);
});

test('Piping to a stream that synchronously errors passes through the error as the cancellation reason', function(t) {
  let recordedReason;
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue('a');
      enqueue('b');
      enqueue('c');
      close();
    },
    cancel: function(reason) {
      recordedReason = reason;
    }
  });

  let written = 0;
  const passedError = new Error('I don\'t like you.');
  const ws = new WritableStream({
    write: function(chunk) {
      return new Promise(function(resolve, reject) {
        if (++written > 1) {
          reject(passedError);
        } else {
          resolve();
        }
      });
    }
  });

  rs.pipeTo(ws);

  setTimeout(function() {
    t.equal(recordedReason, passedError, 'the recorded cancellation reason must be the passed error');
    t.end();
  }, 10);
});

test('Piping to a stream that asynchronously errors passes through the error as the cancellation reason', function(t) {
  let recordedReason;
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue('a');
      enqueue('b');
      enqueue('c');
      close();
    },
    cancel: function(reason) {
      recordedReason = reason;
    }
  });

  let written = 0;
  const passedError = new Error('I don\'t like you.');
  const ws = new WritableStream({
    write: function(chunk) {
      return new Promise(function(resolve, reject) {
        if (++written > 1) {
          setTimeout(function() { reject(passedError); }, 10);
        } else {
          resolve();
        }
      });
    }
  });

  rs.pipeTo(ws);

  setTimeout(function() {
    t.equal(recordedReason, passedError, 'the recorded cancellation reason must be the passed error');
    t.end();
  }, 20);
});

test('Piping to a stream that errors on the last chunk passes through the error to a non-closed producer', function(t) {
  let recordedReason;
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue('a');
      enqueue('b');
      setTimeout(close, 10);
    },
    cancel: function(reason) {
      recordedReason = reason;
    }
  });

  let written = 0;
  const passedError = new Error('I don\'t like you.');
  const ws = new WritableStream({
    write: function(chunk) {
      return new Promise(function(resolve, reject) {
        if (++written > 1) {
          reject(passedError);
        } else {
          resolve();
        }
      });
    }
  });

  rs.pipeTo(ws);

  setTimeout(function() {
    t.equal(recordedReason, passedError, 'the recorded cancellation reason must be the passed error');
    t.end();
  }, 20);
});

test('Piping to a stream that errors on the last chunk does not pass through the error to a closed producer', function(t) {
  let cancelCalled = false;
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue('a');
      enqueue('b');
      close();
    },
    cancel: function() {
      cancelCalled = true;
    }
  });

  let written = 0;
  const ws = new WritableStream({
    write: function(chunk) {
      return new Promise(function(resolve, reject) {
        if (++written > 1) {
          reject(new Error('producer will not see this'));
        } else {
          resolve();
        }
      });
    }
  });

  rs.pipeTo(ws);

  setTimeout(function() {
    t.equal(cancelCalled, false, 'cancel must not be called');
    t.equal(ws.state, 'errored');
    t.end();
  }, 20);
});

test('Piping to a writable stream that does not consume the writes fast enough exerts backpressure on the source', function(t) {
  t.plan(2);

  const enqueueReturnValues = [];
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      setTimeout(function() { enqueueReturnValues.push(enqueue('a')); }, 10);
      setTimeout(function() { enqueueReturnValues.push(enqueue('b')); }, 20);
      setTimeout(function() { enqueueReturnValues.push(enqueue('c')); }, 30);
      setTimeout(function() { enqueueReturnValues.push(enqueue('d')); }, 40);
      setTimeout(function() { close(); }, 50);
    }
  });

  let writtenValues = [];
  const ws = new WritableStream({
    write: function(chunk) {
      return new Promise(function(resolve) {
        setTimeout(function() {
          writtenValues.push(chunk);
          resolve();
        }, 25);
      });
    }
  });

  setTimeout(function() {
    rs.pipeTo(ws).then(function() {
      t.deepEqual(enqueueReturnValues, [true, true, false, false], 'backpressure was correctly exerted at the source');
      t.deepEqual(writtenValues, ['a', 'b', 'c', 'd'], 'all chunks were written');
    });
  }, 0);
});
