
'use strict';

const test = require('tape-catch');

var WritableStream = require('../lib/writable-stream').WritableStream;

function writeArrayToStream(array, writableStream) {
  array.forEach(function(chunk) { writableStream.write(chunk); });
  return writableStream.close();
}

test('error argument is given to start method', function(t) {
  let error;
  const ws = new WritableStream({
    start: function(error_) {
      error = error_;
    }
  });

  // Now error the stream after its construction.
  const passedError = new Error('horrible things');
  error(passedError);
  t.equal(ws.state, 'errored');
  ws.closed.catch(function(r) {
    t.equal(r, passedError);
    t.end();
  });
});

test('Underlying sink\'s write won\'t be called until start finishes', function(t) {
  let expectWriteCall = false;

  let resolveStartPromise;
  const ws = new WritableStream({
    start: function() {
      return new Promise(
        function(resolve, reject) { resolveStartPromise = resolve; });
    },
    write: function(chunk) {
      if (expectWriteCall) {
        t.equal(chunk, 'a');
        t.end();
      } else {
        t.fail('Unexpected write call');
        t.end();
      }
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    }
  });
  ws.write('a');
  t.equal(ws.state, 'waiting');

  // Wait and see that write won't be called.
  setTimeout(function() {
    expectWriteCall = true;
    resolveStartPromise();
  }, 100);
});

test('Underlying sink\'s close won\'t be called until start finishes', function(t) {
  let expectCloseCall = false;

  let resolveStartPromise;
  const ws = new WritableStream({
    start: function() {
      return new Promise(
        function(resolve, reject) { resolveStartPromise = resolve; });
    },
    write: function(chunk) {
      t.fail('Unexpected write call');
      t.end();
    },
    close: function() {
      if (expectCloseCall) {
        t.end();
      } else {
        t.fail('Unexpected close call');
        t.end();
      }
    }
  });
  ws.close('a');
  t.equal(ws.state, 'closing');

  // Wait and see that write won't be called.
  setTimeout(function() {
    expectCloseCall = true;
    resolveStartPromise();
  }, 100);
});

test('Fulfillment value of ws.close() call must be undefined even if the underlying sink returns a non-undefined ' +
     'value', function(t) {
  const ws = new WritableStream({
    close: function() {
      return 'Hello';
    }
  });

  const closePromise = ws.close('a');
       closePromise.then(function(value) {
    t.equal(value, undefined, 'fulfillment value must be undefined');
    t.end();
  }).catch(function() {
    t.fail('closePromise is rejected');
    t.end();
  });
});

test('Underlying sink\'s write or close are never invoked if start throws', function(t) {
  const passedError = new Error('horrible things');

  try {
    const ws = new WritableStream({
      start: function() {
        throw passedError;
      },
      write: function(chunk) {
        t.fail('Unexpected write call');
        t.end();
      },
      close: function() {
        t.fail('Unexpected close call');
        t.end();
      }
    });
  } catch (e) {
    t.equal(e, passedError);
    t.end();
    return;
  }
  t.fail('Constructor didn\'t throw');
  t.end();
});

test('Underlying sink\'s write or close are never invoked if the promise returned by start is rejected', function(t) {
  const ws = new WritableStream({
    start: function() {
      return Promise.reject();
    },
    write: function(chunk) {
      t.fail('Unexpected write call');
      t.end();
    },
    close: function() {
      t.fail('Unexpected close call');
      t.end();
    }
  });

  // Wait and see that write or close won't be called.
  setTimeout(function() {
    t.end();
  }, 100);
});

test('WritableStream can be constructed with no arguments', function(t) {
  t.plan(1);
  t.doesNotThrow(function() { return new WritableStream(); }, 'WritableStream constructed with no errors');
});

test('WritableStream instances have the correct methods and properties', function(t) {
  t.plan(8);

  const ws = new WritableStream();

  t.equal(typeof ws.write, 'function', 'has a write method');
  t.equal(typeof ws.abort, 'function', 'has an abort method');
  t.equal(typeof ws.close, 'function', 'has a close method');

  t.equal(ws.state, 'writable', 'state starts out writable');

  t.ok(ws.ready, 'has a ready property');
  t.ok(ws.ready.then, 'ready property is a thenable');
  t.ok(ws.closed, 'has a closed property');
  t.ok(ws.closed.then, 'closed property is thenable');
});

test('WritableStream with simple input, processed asynchronously', function(t) {
  t.plan(1);

  let storage;
  const ws = new WritableStream({
    start: function() {
      storage = [];
    },

    write: function(chunk) {
      return new Promise(function(resolve) {
        setTimeout(function() {
          storage.push(chunk);
          resolve();
        }, 0);
      });
    },

    close: function() {
      return new Promise(function(resolve) { setTimeout(resolve, 0); });
    }
  });

  const input = [1, 2, 3, 4, 5];
  writeArrayToStream(input, ws).then(
    function() { t.deepEqual(storage, input, 'correct data was relayed to underlying sink'); },
    function(r) { t.fail(r); }
  );
});

test('WritableStream with simple input, processed synchronously', function(t) {
  t.plan(1);

  let storage;
  const ws = new WritableStream({
    start: function() {
      storage = [];
    },

    write: function(chunk) {
      storage.push(chunk);
    },
  });

  const input = [1, 2, 3, 4, 5];
  writeArrayToStream(input, ws).then(
    function() { t.deepEqual(storage, input, 'correct data was relayed to underlying sink'); },
    function(r) { t.fail(r); }
  );
});

test('WritableStream is writable and ready fulfills immediately if the strategy does not apply backpressure', function(t) {
  const ws = new WritableStream({
    strategy: { shouldApplyBackpressure: function() { return false; } }
  });

  t.equal(ws.state, 'writable');

  ws.ready.then(function() {
    t.pass('ready promise was fulfilled');
    t.end();
  });
});

test('WritableStream is waiting and ready does not fulfill immediately if the stream is applying backpressure', function(t) {
  const ws = new WritableStream({
    strategy: { shouldApplyBackpressure: function() { return true; } }
  });

  t.equal(ws.state, 'waiting');

  ws.ready.then(function() {
    t.fail('ready promise was fulfilled');
    t.end();
  });

  setTimeout(function() {
    t.pass('ready promise was left pending');
    t.end();
  }, 30);
});

test('Fulfillment value of ws.write() call must be undefined even if the underlying sink returns a non-undefined ' +
     'value', function(t) {
  const ws = new WritableStream({
    write: function() {
      return 'Hello';
    }
  });

  const writePromise = ws.write('a');
       writePromise.then(function(value) {
    t.equal(value, undefined, 'fulfillment value must be undefined');
    t.end();
  }).catch(function() {
    t.fail('writePromise is rejected');
    t.end();
  });
});

test('WritableStream transitions to waiting until write is acknowledged', function(t) {
  t.plan(3);

  let resolveWritePromise;
  const ws = new WritableStream({
    write: function() {
      return new Promise(function(resolve) { resolveWritePromise = resolve; });
    }
  });

  setTimeout(function() {
    t.equal(ws.state, 'writable', 'state starts writable');
    const writePromise = ws.write('a');
    t.equal(ws.state, 'waiting', 'state is waiting until the write finishes');
    resolveWritePromise();
    writePromise.then(function() {
      t.equal(ws.state, 'writable', 'state becomes writable again after the write finishes');
    });
  }, 0);
});

test('WritableStream if write returns a rejected promise, queued write and close are cleared', function(t) {
  t.plan(6);

  let rejectWritePromise;
  const ws = new WritableStream({
    write: function() {
      return new Promise(function(r, reject) { rejectWritePromise = reject; });
    }
  });

  setTimeout(function() {
    const writePromise = ws.write('a');

    t.notStrictEqual(rejectWritePromise, undefined, 'write is called so rejectWritePromise is set');

    const writePromise2 = ws.write('b');
    const closedPromise = ws.close();

    t.equal(ws.state, 'closing', 'state is closing until the close finishes');

    const passedError = new Error('horrible things');
    rejectWritePromise(passedError);

    writePromise.then(
      function() { t.fail('writePromise is fulfilled unexpectedly'); },
      function(r) {
        t.equal(r, passedError);
        t.equal(ws.state, 'errored', 'state is errored as the sink called error');

        writePromise2.then(
          function() { t.fail('writePromise2 is fulfilled unexpectedly'); },
          function(r) { t.equal(r, passedError); }
        );

        closedPromise.then(
          function() { t.fail('closedPromise is fulfilled unexpectedly'); },
          function(r) { t.equal(r, passedError); }
        );
      }
    );
  }, 0);
});

test('If close is called on a WritableStream in writable state, ready will return a fulfilled promise', function(t) {
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

  // Wait for ws to start.
  setTimeout(function() {
    t.equal(ws.state, 'writable', 'state must be writable');

    ws.close();
    t.equal(ws.state, 'closing', 'state must become closing synchronously on close call');

    ws.ready.then(function(v) {
      t.equal(ws.state, 'closed', 'state must be closed by the time ready fulfills (because microtasks ordering)');
      t.equal(v, undefined, 'ready promise was fulfilled with undefined');
      t.end();
    });
  }, 0);
});

test('If close is called on a WritableStream in waiting state, ready will return a fulfilled promise', function(t) {
  const ws = new WritableStream({
    abort: function() {
      t.fail('Unexpected abort call');
      t.end();
    }
  });

  // Wait for ws to start.
  setTimeout(function() {
    ws.write('a');
    t.equal(ws.state, 'waiting', 'state must become waiting synchronously on write call');

    ws.close();
    t.equal(ws.state, 'closing', 'state must become closing synchronously on close call');

    ws.ready.then(function(v) {
      t.equal(ws.state, 'closing', 'state must still be closing when ready fulfills');
      t.equal(v, undefined, 'ready promise was fulfilled with undefined');
      t.end();
    });
  }, 0);
});

test('If close is called on a WritableStream in waiting state, ready will be fulfilled immediately even if close ' +
     'takes a long time', function(t) {

  let readyFulfilledAlready = false;
  const ws = new WritableStream({
    abort: function() {
      t.fail('Unexpected abort call');
      t.end();
    },
    close: function() {
      return new Promise(function(resolve) {
        setTimeout(function() {
          t.ok(readyFulfilledAlready, 'ready should have fulfilled already');
          resolve();
        }, 50);
      });
    }
  });

  // Wait for ws to start.
  setTimeout(function() {
    ws.write('a');
    t.equal(ws.state, 'waiting', 'state must become waiting synchronously on write call');

    ws.close();
    t.equal(ws.state, 'closing', 'state must become closing synchronously on close call');

    ws.ready.then(function(v) {
      readyFulfilledAlready = true;
      t.equal(ws.state, 'closing', 'state must still be closing when ready fulfills');
      t.equal(v, undefined, 'ready promise was fulfilled with undefined');
      t.end();
    });
  }, 0);
});

test('If sink rejects on a WritableStream in writable state, ready will return a fulfilled promise', function(t) {
  t.plan(5);

  let rejectWritePromise;
  const ws = new WritableStream({
    write: function() {
      return new Promise(function(r, reject) { rejectWritePromise = reject; });
    }
  });

  setTimeout(function() {
    t.equal(ws.state, 'writable', 'state is writable to begin');
    const writePromise = ws.write('a');
    t.equal(ws.state, 'waiting', 'state is waiting after a write');

    const passedError = new Error('pass me');
    rejectWritePromise(passedError);

    writePromise.then(
      function() { t.fail('write promise was unexpectedly fulfilled'); },
      function(r) {
        t.equal(r, passedError, 'write() should be rejected with the passed error');
        t.equal(ws.state, 'errored', 'state is errored as error is called');

        ws.ready.then(function(v) {
          t.equal(v, undefined, 'ready promise was fulfilled with undefined');
          t.end();
        });
      }
    );
  }, 0);
});

test('WritableStream if sink\'s close throws', function(t) {
  const passedError = new Error('pass me');
  const ws = new WritableStream({
    write: function() {
      t.fail('Unexpected write call');
      t.end();
    },
    close: function() {
      throw passedError;
    },
    abort: function() {
      t.fail('Unexpected abort call');
      t.end();
    },
  });

  // Wait for ws to start.
  setTimeout(function() {
    const closedPromise = ws.close();
    t.equal(ws.state, 'closing', 'state must become closing synchronously on close call');

    closedPromise.then(
      function() {
        t.fail('closedPromise is fulfilled unexpectedly');
        t.end();
      },
      function(r) {
        t.equal(ws.state, 'errored', 'state must be errored as error is called');
        t.equal(r, passedError, 'close() should be rejected with the passed error');

        ws.ready.then(function(v) {
          t.equal(v, undefined, 'ready promise was fulfilled with undefined');
          t.end();
        });
      }
    );
  }, 0);
});

test('WritableStream if the promise returned by sink\'s close rejects', function(t) {
  const passedError = new Error('pass me');
  const ws = new WritableStream({
    write: function() {
      t.fail('write of sink called');
      t.end();
    },
    close: function() {
      return Promise.reject(passedError);
    },
    abort: function() {
      t.fail('abort of sink called');
      t.end();
    },
  });

  // Wait for ws to start.
  setTimeout(function() {
    const closedPromise = ws.close();
    t.equal(ws.state, 'closing', 'state must become closing synchronously on close call');

    closedPromise.then(
      function() {
        t.fail('closedPromise is fulfilled');
        t.end();
      },
      function(r) {
        t.equal(ws.state, 'errored', 'state must be errored as error is called');
        t.equal(r, passedError, 'close() should be rejected with the passed error');

        ws.ready.then(function(v) {
          t.equal(v, undefined, 'ready promise was fulfilled with undefined');
          t.end();
        });
      }
    );
  }, 0);
});

test('If sink rejects on a WritableStream in waiting state, ready will return a rejected promise', function(t) {
  t.plan(5);

  const passedError = new Error('pass me');
  const ws = new WritableStream({
    write: function(chunk) {
      if (chunk === 'first chunk succeeds') {
        return new Promise(function(resolve) { setTimeout(resolve, 10); });
      }
      return Promise.reject(passedError);
    }
  });

  setTimeout(function() {
    ws.write('first chunk succeeds');
    t.equal(ws.state, 'waiting', 'state is waiting after first write');

    const secondWritePromise = ws.write('all other chunks fail');
    t.equal(ws.state, 'waiting', 'state is waiting after a second write');

    secondWritePromise.then(
      function() { t.fail('write promise was unexpectedly fulfilled'); },
      function(r) {
        t.equal(r, passedError, 'write() should be rejected with the passed error');
        t.equal(ws.state, 'errored', 'state is errored as error is called');

        ws.ready.then(function(v) {
          t.equal(v, undefined, 'ready promise was fulfilled with undefined');
          t.end();
        });
      }
    );
  }, 0);
});

test('WritableStream if sink throws an error inside write, the stream becomes errored and the promise rejects', function(t) {
  t.plan(3);

  const thrownError = new Error('throw me');
  const ws = new WritableStream({
    write: function() {
      throw thrownError;
    }
  });

  ws.write('a').then(
    function() { t.fail('write promise was unexpectedly fulfilled'); },
    function(r) {
      t.equal(r, thrownError, 'write() should reject with the thrown error');
      t.equal(ws.state, 'errored', 'state is errored');

      ws.close().then(
        function()  { t.fail('close() is fulfilled unexpectedly'); },
        function(r) { t.equal(r, thrownError, 'close() should be rejected with the thrown error'); }
      );
    }
  );
});

test('WritableStream exception in shouldApplyBackpressure during write moves the stream into errored state', function(t) {
  t.plan(3);

  let aboutToWrite = false;
  const thrownError = new Error('throw me');
  const ws = new WritableStream({
    strategy: {
      size: function() {
        return 1;
      },
      shouldApplyBackpressure: function() {
        if (aboutToWrite) {
          throw thrownError;
        }
      }
    }
  });

  aboutToWrite = true;
  ws.write('a').catch(function(r) {
    t.equal(r, thrownError);
  });

  t.equal(ws.state, 'errored', 'the state of ws must be errored as shouldApplyBackpressure threw');
  ws.closed.catch(function(r) {
    t.equal(r, thrownError);
  });
});

test('WritableStream exception in size during write moves the stream into errored state', function(t) {
  t.plan(3);

  const thrownError = new Error('throw me');
  const ws = new WritableStream({
    strategy: {
      size: function() {
        throw thrownError;
      },
      shouldApplyBackpressure: function() {
        return false;
      }
    }
  });
  ws.write('a').catch(function(r) {
    t.equal(r, thrownError);
  });
  t.equal(ws.state, 'errored', 'the state of ws must be errored as size threw');
  ws.closed.catch(function(r) {
    t.equal(r, thrownError);
  });
});

test('WritableStream NaN size during write moves the stream into errored state', function(t) {
  t.plan(3);

  const ws = new WritableStream({
    strategy: {
      size: function() {
        return NaN;
      },
      shouldApplyBackpressure: function() {
        return false;
      }
    }
  });
  ws.write('a').catch(function(r) {
    t.equal(r.constructor, RangeError);
  });
  t.equal(ws.state, 'errored', 'the state of ws must be errored as an invalid size was returned');
  ws.closed.catch(function(r) {
    t.equal(r.constructor, RangeError);
  });
});

test('WritableStream +Infinity size during write moves the stream into errored state', function(t) {
  t.plan(3);

  const ws = new WritableStream({
    strategy: {
      size: function() {
        return +Infinity;
      },
      shouldApplyBackpressure: function() {
        return false;
      }
    }
  });
  ws.write('a').catch(function(r) {
    t.equal(r.constructor, RangeError);
  });
  t.equal(ws.state, 'errored', 'the state of ws must be errored as an invalid size was returned');
  ws.closed.catch(function(r) {
    t.equal(r.constructor, RangeError);
  });
});

test('WritableStream -Infinity size during write moves the stream into errored state', function(t) {
  t.plan(3);

  const ws = new WritableStream({
    strategy: {
      size: function() {
        return -Infinity;
      },
      shouldApplyBackpressure: function() {
        return false;
      }
    }
  });
  ws.write('a').catch(function(r) {
    t.equal(r.constructor, RangeError);
  });
  t.equal(ws.state, 'errored', 'the state of ws must be errored as an invalid size was returned');
  ws.closed.catch(function(r) {
    t.equal(r.constructor, RangeError);
  });
});

test('WritableStream exception in shouldApplyBackpressure moves the stream into errored state but previous writes ' +
     'finish', function(t) {
  t.plan(4);

  let thrownError;

  let resolveWritePromise;
  const ws = new WritableStream({
    write: function(chunk) {
      return new Promise(function(resolve) { resolveWritePromise = resolve; });
    },
    strategy: {
      size: function() {
        return 1;
      },
      shouldApplyBackpressure: function() {
        if (thrownError) {
          throw thrownError;
        } else {
          return false;
        }
      }
    }
  });

  setTimeout(function() {
    ws.write('a').then(function() {
      t.pass('The write must be successful as the underlying sink acknowledged it');

      t.equal(ws.state, 'errored', 'the state of ws must be errored as shouldApplyBackpressure threw');
      ws.closed.catch(function(r) {
        t.equal(r, thrownError);
      });
    });
    t.equal(ws.state, 'writable', 'the state of ws must be still writable');

    thrownError = new Error('throw me');
    resolveWritePromise();
  }, 0);
});

test('WritableStream if sink throws an error while closing, the stream becomes errored', function(t) {
  t.plan(3);

  const thrownError = new Error('throw me');
  const ws = new WritableStream({
    close: function() {
      throw thrownError;
    }
  });

  ws.close().then(
    function() { t.fail('close promise is fulfilled unexpectedly'); },
    function(r) {
      t.equal(r, thrownError, 'close promise should be rejected with the thrown error');
      t.equal(ws.state, 'errored', 'state is errored after calling close');
    }
  );

  setTimeout(function() {
    t.equal(ws.state, 'errored', 'state stays errored');
  }, 0);
});

test('WritableStream if sink calls error while asynchronously closing, the stream becomes errored', function(t) {
  t.plan(3);

  const passedError = new Error('error me');
  let error;
  const ws = new WritableStream({
    start: function(error_) {
      error = error_;
    },
    close: function() {
      return new Promise(function(resolve) { setTimeout(resolve, 50); });
    }
  });

  ws.close();
  setTimeout(function() { error(passedError); }, 10);

  ws.closed.then(
    function() { t.fail('closed promise is fulfilled unexpectedly'); },
    function(r) {
      t.equal(r, passedError, 'closed promise should be rejected with the passed error');
      t.equal(ws.state, 'errored', 'state is errored');
    }
  );

  setTimeout(function() {
    t.equal(ws.state, 'errored', 'state stays errored');
  }, 70);
});


test('WritableStream if sink calls error while closing with no asynchrony, the stream becomes errored', function(t) {
  t.plan(3);

  const passedError = new Error('error me');
  let error;
  const ws = new WritableStream({
    start: function(error_) {
      error = error_;
    },
    close: function() {
      error(passedError);
    }
  });

  ws.close().then(
    function() { t.fail('close promise is fulfilled unexpectedly'); },
    function(r) {
      t.equal(r, passedError, 'close promise should be rejected with the passed error');
      t.equal(ws.state, 'errored', 'state is errored');
    }
  );

  setTimeout(function() {
    t.equal(ws.state, 'errored', 'state stays errored');
  }, 0);
});

test('WritableStream queue lots of data and have all of them processed at once', function(t) {
  t.plan(4);

  const numberOfWrites = 10000;

  let resolveFirstWritePromise;
  let writeCount = 0;
  const ws = new WritableStream({
    write: function(chunk) {
      ++writeCount;
      if (!resolveFirstWritePromise) {
        return new Promise(function(resolve) { resolveFirstWritePromise = resolve; });
      }
    }
  });

  setTimeout(function() {
    let writePromise;
    for (let i = 0; i < numberOfWrites; ++i) {
      writePromise = ws.write('a');
    }

    t.equal(ws.state, 'waiting', 'state is waiting since the queue is full of writeRecords');
    t.equal(writeCount, 1, 'should have called sink\'s write once');

    resolveFirstWritePromise();

    writePromise.then(
      function() {
        t.equal(ws.state, 'writable', 'state is writable again since all writeRecords is done now');
        t.equal(writeCount, numberOfWrites, "should have called sink's write " + numberOfWrites + " times");
      },
      t.ifError
    );
  }, 0);
});

test('WritableStream should call underlying sink methods as methods', function(t) {
  t.plan(7);

  var theSink;

  function Sink() {
  }

  Sink.prototype = Object.create(null, {
    start: {
      value: function() {
        t.equal(this, theSink, 'start() should be called with the correct this');
      }
    },

    write: {
      value: function() {
        t.equal(this, theSink, 'pull() should be called with the correct this');
      }
    },

    close: {
      value: function() {
        t.equal(this, theSink, 'close() should be called with the correct this');
      }
    },

    abort: {
      value: function() {
        t.equal(this, theSink, 'abort() should be called with the correct this');
      }
    },

    strategy: {
      get: function() {
        // Called three times
        t.equal(this, theSink, 'strategy getter should be called with the correct this');
        return undefined;
      }
    }
  });

  theSink = new Sink();

  theSink.debugName = "the sink object passed to the constructor";
  const ws = new WritableStream(theSink);

  ws.write('a');
  ws.close();

  const ws2 = new WritableStream(theSink);
  ws.abort();
});
