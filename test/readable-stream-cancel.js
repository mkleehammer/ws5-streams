
'use strict';

const test = require('tape-catch');

var ReadableStream = require('../lib/readable-stream').ReadableStream;

var RandomPushSource = require('./utils/random-push-source');
var readableStreamToArray = require('./utils/readable-stream-to-array');
var sequentialReadableStream = require('./utils/sequential-rs');

test('ReadableStream canceling an infinite stream', function(t) {
  const randomSource = new RandomPushSource();

  let cancelationFinished = false;
  const rs = new ReadableStream({
    start: function(enqueue, close, error) {
      randomSource.ondata = enqueue;
      randomSource.onend = close;
      randomSource.onerror = error;
    },

    pull: function() {
      randomSource.readStart();
    },

    cancel: function() {
      randomSource.readStop();
      randomSource.onend();

      return new Promise(function(resolve) { setTimeout(function() {
        cancelationFinished = true;
        resolve();
      }, 50); });
    }
  });

  readableStreamToArray(rs).then(
    function(storage) {
      t.equal(rs.state, 'closed', 'stream should be closed');
      t.equal(cancelationFinished, false, 'it did not wait for the cancellation process to finish before closing');
      t.ok(storage.length > 0, 'should have gotten some data written through the pipe');
      for (let i = 0; i < storage.length; i++) {
        t.equal(storage[i].length, 128, 'each chunk has 128 bytes');
      }
    },
    function() {
      t.fail('the stream should be successfully read to the end');
      t.end();
    }
  );

  setTimeout(function() {
    rs.cancel().then(function() {
      t.equal(cancelationFinished, true, 'it returns a promise that is fulfilled when the cancellation finishes');
      t.end();
    });
  }, 150);
});

test('ReadableStream cancellation puts the stream in a closed state (no chunks pulled yet)', function(t) {
  const rs = sequentialReadableStream(5);

  t.plan(5);

  rs.closed.then(
    function() { t.assert(true, 'closed promise vended before the cancellation should fulfill'); },
    function() { t.fail('closed promise vended before the cancellation should not be rejected'); }
  );

  rs.ready.then(
    function() { t.assert(true, 'ready promise vended before the cancellation should fulfill'); },
    function() { t.fail('ready promise vended before the cancellation should not be rejected'); }
  );

  rs.cancel();

  t.equal(rs.state, 'closed', 'state should be closed');

  rs.closed.then(
    function() { t.assert(true, 'closed promise vended after the cancellation should fulfill'); },
    function() { t.fail('closed promise vended after the cancellation should not be rejected'); }
  );
  rs.ready.then(
    function() { t.assert(true, 'ready promise vended after the cancellation should fulfill'); },
    function() { t.fail('ready promise vended after the cancellation should not be rejected'); }
  );
});

test('ReadableStream cancellation puts the stream in a closed state (after waiting for chunks)', function(t) {
  const rs = sequentialReadableStream(5);

  t.plan(5);

  rs.ready.then(
    function() {
      rs.closed.then(
        function() { t.assert(true, 'closed promise vended before the cancellation should fulfill'); },
        function() { t.fail('closed promise vended before the cancellation should not be rejected'); }
      );

      rs.ready.then(
        function() { t.assert(true, 'ready promise vended before the cancellation should fulfill'); },
        function() { t.fail('ready promise vended before the cancellation should not be rejected'); }
      );

      rs.cancel();

      t.equal(rs.state, 'closed', 'state should be closed');

      rs.closed.then(
        function() { t.assert(true, 'closed promise vended after the cancellation should fulfill'); },
        function() { t.fail('closed promise vended after the cancellation should not be rejected'); }
      );
      rs.ready.then(
        function() { t.assert(true, 'ready promise vended after the cancellation should fulfill'); },
        function() { t.fail('ready promise vended after the cancellation should not be rejected'); }
      );
    },
    function(r) { return t.ifError(r); }
  );
});

test('ReadableStream explicit cancellation passes through the given reason', function(t) {
  let recordedReason;
  const rs = new ReadableStream({
    cancel: function(reason) {
      recordedReason = reason;
    }
  });

  const passedReason = new Error('Sorry, it just wasn\'t meant to be.');
  rs.cancel(passedReason);

  t.equal(recordedReason, passedReason);
  t.end();
});

test('ReadableStream rs.cancel() on a closed stream returns a promise resolved with undefined', function(t) {
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      close();
    }
  });

  t.equal(rs.state, 'closed');
  const cancelPromise = rs.cancel(undefined);
  cancelPromise.then(function(value) {
    t.equal(value, undefined, 'fulfillment value of cancelPromise must be undefined');
    t.end();
  }).catch(function(r) {
    t.fail('cancelPromise is rejected');
    t.end();
  });
});

test('ReadableStream rs.cancel() on an errored stream returns a promise rejected with the error', function(t) {
  const passedError = new Error('aaaugh!!');

  const rs = new ReadableStream({
    start: function(enqueue, close, error) {
      error(passedError);
    }
  });

  t.equal(rs.state, 'errored');
  const cancelPromise = rs.cancel(undefined);
  cancelPromise.then(function()  {
    t.fail('cancelPromise is fulfilled');
    t.end();
  }).catch(function(r) {
    t.equal(r, passedError, 'cancelPromise must be rejected with passedError');
    t.end();
  });
});

test('ReadableStream the fulfillment value of the promise rs.cancel() returns must be undefined', function(t) {
  const rs = new ReadableStream({
    cancel: function(reason) {
      return "Hello";
    }
  });

  const cancelPromise = rs.cancel(undefined);
  cancelPromise.then(function(value) {
    t.equal(value, undefined, 'fulfillment value of cancelPromise must be undefined');
    t.end();
  }).catch(function(r) {
    t.fail('cancelPromise is rejected');
    t.end();
  });
});

test('ReadableStream if source\'s cancel throws, the promise returned by rs.cancel() rejects', function(t) {
  const errorInCancel = new Error('Sorry, it just wasn\'t meant to be.');
  const rs = new ReadableStream({
    cancel: function(reason) {
      throw errorInCancel;
    }
  });

  const cancelPromise = rs.cancel(undefined);
  cancelPromise.then(
    function() {
      t.fail('cancelPromise is fulfilled unexpectedly');
      t.end();
    },
    function(r) {
      t.equal(r, errorInCancel, 'rejection reason of cancelPromise must be errorInCancel');
      t.end();
    }
  );
});

test('ReadableStream onCancel returns a promise that will be resolved asynchronously', function(t) {
  let resolveSourceCancelPromise;
  const rs = new ReadableStream({
    cancel: function() {
      return new Promise(function(resolve, reject) {
        resolveSourceCancelPromise = resolve;
      });
    }
  });

  let hasResolvedSourceCancelPromise = false;

  const cancelPromise = rs.cancel();
  cancelPromise.then(
    function(value) {
      t.equal(hasResolvedSourceCancelPromise, true,
              'cancelPromise must not be resolved before the promise returned by onCancel is resolved');
      t.equal(value, undefined, 'cancelPromise must be fulfilled with undefined');
      t.end();
    }
  ).catch(
    function(r) {
      t.fail('cancelPromise is rejected');
      t.end();
    }
  );

  setTimeout(function() {
    hasResolvedSourceCancelPromise = true;
    resolveSourceCancelPromise('Hello');
  }, 0);
});

test('ReadableStream onCancel returns a promise that will be rejected asynchronously', function(t) {
  let rejectSourceCancelPromise;
  const rs = new ReadableStream({
    cancel: function() {
      return new Promise(function(resolve, reject) {
        rejectSourceCancelPromise = reject;
      });
    }
  });

  let hasRejectedSourceCancelPromise = false;
  const errorInCancel = new Error('Sorry, it just wasn\'t meant to be.');

  const cancelPromise = rs.cancel();
  cancelPromise.then(
    function(value) {
      t.fail('cancelPromise is fulfilled');
      t.end();
    },
    function(r) {
      t.equal(hasRejectedSourceCancelPromise, true,
              'cancelPromise must not be resolved before the promise returned by onCancel is resolved');
      t.equal(r, errorInCancel, 'cancelPromise must be rejected with errorInCancel');
      t.end();
    }
  );

  setTimeout(function() {
    hasRejectedSourceCancelPromise = true;
    rejectSourceCancelPromise(errorInCancel);
  }, 0);
});

test('ReadableStream cancelation before start finishes prevents pull() from being called', function(t) {
  const rs = new ReadableStream({
    pull: function() {
      t.fail('unexpected pull call');
      t.end();
    }
  });

  rs.cancel();

  setTimeout(function() {
    t.pass('pull was never called');
    t.end();
  }, 0);
});
