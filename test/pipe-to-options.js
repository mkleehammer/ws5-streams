const test = require('tape-catch');

import sequentialReadableStream from './utils/sequential-rs';

test('Piping with no options and no errors', t => {
  const rs = sequentialReadableStream(5, { async: true });
  const ws = new WritableStream({
    abort() {
      t.fail('unexpected abort call');
    }
  });

  rs.pipeTo(ws);

  rs.closed.then(() => {
    setTimeout(() => {
      t.equal(ws.state, 'closed', 'destination should be closed');
      t.end();
    }, 0);
  });
});

test('Piping with { preventClose: false } and no errors', t => {
  const rs = sequentialReadableStream(5, { async: true });
  const ws = new WritableStream({
    abort() {
      t.fail('unexpected abort call');
    }
  });

  rs.pipeTo(ws, { preventClose: false });

  rs.closed.then(() => {
    setTimeout(() => {
      t.equal(ws.state, 'closed', 'destination should be closed');
      t.end();
    }, 0);
  });
});

test('Piping with { preventClose: true } and no errors', t => {
  const rs = sequentialReadableStream(5, { async: true });
  const ws = new WritableStream({
    close() {
      t.fail('unexpected close call');
      t.end();
    },
    abort() {
      t.fail('unexpected abort call');
    }
  });

  const pipeToPromise = rs.pipeTo(ws, { preventClose: true });

  rs.closed.then(() => {
    setTimeout(() => {
      t.equal(ws.state, 'writable', 'destination should be writable');

      pipeToPromise.then(
        v => {
          t.equal(v, undefined);
          t.end();
        },
        r => {
          t.fail('pipeToPromise is rejected');
          t.end();
        }
      );
    }, 0);
  });
});

test('Piping with no options and a source error', t => {
  const theError = new Error('source error');
  const rs = new ReadableStream({
    start() {
      return Promise.reject(theError);
    }
  });
  const ws = new WritableStream({
    abort(r) {
      t.equal(r, theError, 'reason passed to abort equals the source error');
      t.end();
    }
  });

  rs.pipeTo(ws);
});

test('Piping with { preventAbort: false } and a source error', t => {
  const theError = new Error('source error');
  const rs = new ReadableStream({
    start() {
      return Promise.reject(theError);
    }
  });
  const ws = new WritableStream({
    abort(r) {
      t.equal(r, theError, 'reason passed to abort equals the source error');
      t.end();
    }
  });

  rs.pipeTo(ws, { preventAbort: false });
});

test('Piping with { preventAbort: true } and a source error', t => {
  const theError = new Error('source error');
  const rs = new ReadableStream({
    start() {
      return Promise.reject(theError);
    }
  });
  const ws = new WritableStream({
    abort(r) {
      t.fail('unexpected call to abort');
      t.end();
    }
  });

  const pipeToPromise = rs.pipeTo(ws, { preventAbort: true });

  rs.closed.catch(() => {
    setTimeout(() => {
      t.equal(ws.state, 'writable', 'destination should remain writable');

      pipeToPromise.then(
        () => {
          t.fail('pipeToPromise is fulfilled');
          t.end();
        },
        r => {
          t.equal(r, theError, 'rejection reason of pipeToPromise is the source error');
          t.end();
        }
      );
    }, 0);
  })
});

test('Piping with no options and a destination error', t => {
  t.plan(2);

  const theError = new Error('destination error');
  const rs = new ReadableStream({
    start(enqueue, close) {
      enqueue('a');
      setTimeout(() => enqueue('b'), 10);
      setTimeout(() => {
        t.throws(() => enqueue('c'), /TypeError/, 'enqueue after cancel must throw a TypeError');
      }, 20);
    },
    cancel(r) {
      t.equal(r, theError, 'reason passed to cancel equals the source error');
    }
  });

  const ws = new WritableStream({
    write(chunk) {
      if (chunk === 'b') {
        throw theError;
      }
    }
  });

  rs.pipeTo(ws);
});

test('Piping with { preventCancel: false } and a destination error', t => {
  t.plan(2);

  const theError = new Error('destination error');
  const rs = new ReadableStream({
    start(enqueue, close) {
      enqueue('a');
      setTimeout(() => enqueue('b'), 10);
      setTimeout(() => {
        t.throws(() => enqueue('c'), /TypeError/, 'enqueue after cancel must throw a TypeError');
      }, 20);
    },
    cancel(r) {
      t.equal(r, theError, 'reason passed to cancel equals the source error');
    }
  });

  const ws = new WritableStream({
    write(chunk) {
      if (chunk === 'b') {
        throw theError;
      }
    }
  });

  rs.pipeTo(ws, { preventCancel: false });
});

test('Piping with { preventCancel: true } and a destination error', t => {
  const theError = new Error('destination error');
  const rs = new ReadableStream({
    start(enqueue, close) {
      enqueue('a');
      setTimeout(() => enqueue('b'), 10);
      setTimeout(() => enqueue('c'), 20);
    },
    cancel(r) {
      t.fail('unexpected call to cancel');
      t.end();
    }
  });

  const ws = new WritableStream({
    write(chunk) {
      if (chunk === 'b') {
        throw theError;
      }
    }
  });

  const pipeToPromise = rs.pipeTo(ws, { preventCancel: true });

  ws.closed.catch(() => {
    setTimeout(() => {
      t.equal(rs.state, 'readable', 'source should remain readable');

      pipeToPromise.then(
        () => {
          t.fail('pipeToPromise is fulfilled');
          t.end();
        },
        r => {
          t.equal(r, theError, 'rejection reason of pipeToPromise is the sink error');
          t.end();
        }
      );
    }, 30);
  });
});
