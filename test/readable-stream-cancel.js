const test = require('tape-catch');

import RandomPushSource from './utils/random-push-source';
import readableStreamToArray from './utils/readable-stream-to-array';
import sequentialReadableStream from './utils/sequential-rs';

test('ReadableStream canceling an infinite stream', t => {
  const randomSource = new RandomPushSource();

  let cancelationFinished = false;
  const rs = new ReadableStream({
    start(enqueue, close, error) {
      randomSource.ondata = enqueue;
      randomSource.onend = close;
      randomSource.onerror = error;
    },

    pull() {
      randomSource.readStart();
    },

    cancel() {
      randomSource.readStop();
      randomSource.onend();

      return new Promise(resolve => setTimeout(() => {
        cancelationFinished = true;
        resolve();
      }, 50));
    }
  });

  readableStreamToArray(rs).then(
    storage => {
      t.equal(rs.state, 'closed', 'stream should be closed');
      t.equal(cancelationFinished, false, 'it did not wait for the cancellation process to finish before closing');
      t.ok(storage.length > 0, 'should have gotten some data written through the pipe');
      for (let i = 0; i < storage.length; i++) {
        t.equal(storage[i].length, 128, 'each chunk has 128 bytes');
      }
    },
    () => {
      t.fail('the stream should be successfully read to the end');
      t.end();
    }
  );

  setTimeout(() => {
    rs.cancel().then(() => {
      t.equal(cancelationFinished, true, 'it returns a promise that is fulfilled when the cancellation finishes');
      t.end();
    });
  }, 150);
});

test('ReadableStream cancellation puts the stream in a closed state (no chunks pulled yet)', t => {
  const rs = sequentialReadableStream(5);

  t.plan(5);

  rs.closed.then(
    () => t.assert(true, 'closed promise vended before the cancellation should fulfill'),
    () => t.fail('closed promise vended before the cancellation should not be rejected')
  );

  rs.ready.then(
    () => t.assert(true, 'ready promise vended before the cancellation should fulfill'),
    () => t.fail('ready promise vended before the cancellation should not be rejected')
  );

  rs.cancel();

  t.equal(rs.state, 'closed', 'state should be closed');

  rs.closed.then(
    () => t.assert(true, 'closed promise vended after the cancellation should fulfill'),
    () => t.fail('closed promise vended after the cancellation should not be rejected')
  );
  rs.ready.then(
    () => t.assert(true, 'ready promise vended after the cancellation should fulfill'),
    () => t.fail('ready promise vended after the cancellation should not be rejected')
  );
});

test('ReadableStream cancellation puts the stream in a closed state (after waiting for chunks)', t => {
  const rs = sequentialReadableStream(5);

  t.plan(5);

  rs.ready.then(
    () => {
      rs.closed.then(
        () => t.assert(true, 'closed promise vended before the cancellation should fulfill'),
        () => t.fail('closed promise vended before the cancellation should not be rejected')
      );

      rs.ready.then(
        () => t.assert(true, 'ready promise vended before the cancellation should fulfill'),
        () => t.fail('ready promise vended before the cancellation should not be rejected')
      );

      rs.cancel();

      t.equal(rs.state, 'closed', 'state should be closed');

      rs.closed.then(
        () => t.assert(true, 'closed promise vended after the cancellation should fulfill'),
        () => t.fail('closed promise vended after the cancellation should not be rejected')
      );
      rs.ready.then(
        () => t.assert(true, 'ready promise vended after the cancellation should fulfill'),
        () => t.fail('ready promise vended after the cancellation should not be rejected')
      );
    },
    r => t.ifError(r)
  );
});

test('ReadableStream explicit cancellation passes through the given reason', t => {
  let recordedReason;
  const rs = new ReadableStream({
    cancel(reason) {
      recordedReason = reason;
    }
  });

  const passedReason = new Error('Sorry, it just wasn\'t meant to be.');
  rs.cancel(passedReason);

  t.equal(recordedReason, passedReason);
  t.end();
});

test('ReadableStream rs.cancel() on a closed stream returns a promise resolved with undefined', t => {
  const rs = new ReadableStream({
    start(enqueue, close) {
      close();
    }
  });

  t.equal(rs.state, 'closed');
  const cancelPromise = rs.cancel(undefined);
  cancelPromise.then(value => {
    t.equal(value, undefined, 'fulfillment value of cancelPromise must be undefined');
    t.end();
  }).catch(r => {
    t.fail('cancelPromise is rejected');
    t.end();
  });
});

test('ReadableStream rs.cancel() on an errored stream returns a promise rejected with the error', t => {
  const passedError = new Error('aaaugh!!');

  const rs = new ReadableStream({
    start(enqueue, close, error) {
      error(passedError);
    }
  });

  t.equal(rs.state, 'errored');
  const cancelPromise = rs.cancel(undefined);
  cancelPromise.then(() => {
    t.fail('cancelPromise is fulfilled');
    t.end();
  }).catch(r => {
    t.equal(r, passedError, 'cancelPromise must be rejected with passedError');
    t.end();
  });
});

test('ReadableStream the fulfillment value of the promise rs.cancel() returns must be undefined', t => {
  const rs = new ReadableStream({
    cancel(reason) {
      return "Hello";
    }
  });

  const cancelPromise = rs.cancel(undefined);
  cancelPromise.then(value => {
    t.equal(value, undefined, 'fulfillment value of cancelPromise must be undefined');
    t.end();
  }).catch(r => {
    t.fail('cancelPromise is rejected');
    t.end();
  });
});

test('ReadableStream if source\'s cancel throws, the promise returned by rs.cancel() rejects', t => {
  const errorInCancel = new Error('Sorry, it just wasn\'t meant to be.');
  const rs = new ReadableStream({
    cancel(reason) {
      throw errorInCancel;
    }
  });

  const cancelPromise = rs.cancel(undefined);
  cancelPromise.then(
    () => {
      t.fail('cancelPromise is fulfilled unexpectedly');
      t.end();
    },
    r => {
      t.equal(r, errorInCancel, 'rejection reason of cancelPromise must be errorInCancel');
      t.end();
    }
  );
});

test('ReadableStream onCancel returns a promise that will be resolved asynchronously', t => {
  let resolveSourceCancelPromise;
  const rs = new ReadableStream({
    cancel() {
      return new Promise((resolve, reject) => {
        resolveSourceCancelPromise = resolve;
      });
    }
  });

  let hasResolvedSourceCancelPromise = false;

  const cancelPromise = rs.cancel();
  cancelPromise.then(
    value => {
      t.equal(hasResolvedSourceCancelPromise, true,
              'cancelPromise must not be resolved before the promise returned by onCancel is resolved');
      t.equal(value, undefined, 'cancelPromise must be fulfilled with undefined');
      t.end();
    }
  ).catch(
    r => {
      t.fail('cancelPromise is rejected');
      t.end();
    }
  );

  setTimeout(() => {
    hasResolvedSourceCancelPromise = true;
    resolveSourceCancelPromise('Hello');
  }, 0);
});

test('ReadableStream onCancel returns a promise that will be rejected asynchronously', t => {
  let rejectSourceCancelPromise;
  const rs = new ReadableStream({
    cancel() {
      return new Promise((resolve, reject) => {
        rejectSourceCancelPromise = reject;
      });
    }
  });

  let hasRejectedSourceCancelPromise = false;
  const errorInCancel = new Error('Sorry, it just wasn\'t meant to be.');

  const cancelPromise = rs.cancel();
  cancelPromise.then(
    value => {
      t.fail('cancelPromise is fulfilled');
      t.end();
    },
    r => {
      t.equal(hasRejectedSourceCancelPromise, true,
              'cancelPromise must not be resolved before the promise returned by onCancel is resolved');
      t.equal(r, errorInCancel, 'cancelPromise must be rejected with errorInCancel');
      t.end();
    }
  );

  setTimeout(() => {
    hasRejectedSourceCancelPromise = true;
    rejectSourceCancelPromise(errorInCancel);
  }, 0);
});

test('ReadableStream cancelation before start finishes prevents pull() from being called', t => {
  const rs = new ReadableStream({
    pull() {
      t.fail('unexpected pull call');
      t.end();
    }
  });

  rs.cancel();

  setTimeout(() => {
    t.pass('pull was never called');
    t.end();
  }, 0);
});