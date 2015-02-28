
'use strict';

const test = require('tape-catch');

var WritableStream = require('../lib/writable-stream').WritableStream;
var ReadableStream = require('../lib/readable-stream').ReadableStream;
var sequentialReadableStream = require('./utils/sequential-rs');

test('Piping with no options and no errors', function(t) {
  const rs = sequentialReadableStream(5, { async: true });
  const ws = new WritableStream({
    abort: function() {
      t.fail('unexpected abort call');
    }
  });

  rs.pipeTo(ws);

  rs.closed.then(function() {
    setTimeout(function() {
      t.equal(ws.state, 'closed', 'destination should be closed');
      t.end();
    }, 0);
  });
});

test('Piping with { preventClose: false } and no errors', function(t) {
  const rs = sequentialReadableStream(5, { async: true });
  const ws = new WritableStream({
    abort: function() {
      t.fail('unexpected abort call');
    }
  });

  rs.pipeTo(ws, { preventClose: false });

  rs.closed.then(function() {
    setTimeout(function() {
      t.equal(ws.state, 'closed', 'destination should be closed');
      t.end();
    }, 0);
  });
});

test('Piping with { preventClose: true } and no errors', function(t) {
  const rs = sequentialReadableStream(5, { async: true });
  const ws = new WritableStream({
    close: function() {
      t.fail('unexpected close call');
      t.end();
    },
    abort: function() {
      t.fail('unexpected abort call');
    }
  });

  const pipeToPromise = rs.pipeTo(ws, { preventClose: true });

  rs.closed.then(function() {
    setTimeout(function() {
      t.equal(ws.state, 'writable', 'destination should be writable');

      pipeToPromise.then(
        function(v) {
          t.equal(v, undefined);
          t.end();
        },
        function(r) {
          t.fail('pipeToPromise is rejected');
          t.end();
        }
      );
    }, 0);
  });
});

test('Piping with no options and a source error', function(t) {
  const theError = new Error('source error');
  const rs = new ReadableStream({
    start: function() {
      return Promise.reject(theError);
    }
  });
  const ws = new WritableStream({
    abort: function(r) {
      t.equal(r, theError, 'reason passed to abort equals the source error');
      t.end();
    }
  });

  rs.pipeTo(ws);
});

test('Piping with { preventAbort: false } and a source error', function(t) {
  const theError = new Error('source error');
  const rs = new ReadableStream({
    start: function() {
      return Promise.reject(theError);
    }
  });
  const ws = new WritableStream({
    abort: function(r) {
      t.equal(r, theError, 'reason passed to abort equals the source error');
      t.end();
    }
  });

  rs.pipeTo(ws, { preventAbort: false });
});

test('Piping with { preventAbort: true } and a source error', function(t) {
  const theError = new Error('source error');
  const rs = new ReadableStream({
    start: function() {
      return Promise.reject(theError);
    }
  });
  const ws = new WritableStream({
    abort: function(r) {
      t.fail('unexpected call to abort');
      t.end();
    }
  });

  const pipeToPromise = rs.pipeTo(ws, { preventAbort: true });

  rs.closed.catch(function() {
    setTimeout(function() {
      t.equal(ws.state, 'writable', 'destination should remain writable');

      pipeToPromise.then(
        function() {
          t.fail('pipeToPromise is fulfilled');
          t.end();
        },
        function(r) {
          t.equal(r, theError, 'rejection reason of pipeToPromise is the source error');
          t.end();
        }
      );
    }, 0);
  })
});

test('Piping with no options and a destination error', function(t) {
  t.plan(2);

  const theError = new Error('destination error');
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue('a');
      setTimeout(function() { enqueue('b'); }, 10);
      setTimeout(function() {
        t.throws(function() { enqueue('c'); }, /TypeError/, 'enqueue after cancel must throw a TypeError');
      }, 20);
    },
    cancel: function(r) {
      t.equal(r, theError, 'reason passed to cancel equals the source error');
    }
  });

  const ws = new WritableStream({
    write: function(chunk) {
      if (chunk === 'b') {
        throw theError;
      }
    }
  });

  rs.pipeTo(ws);
});

test('Piping with { preventCancel: false } and a destination error', function(t) {
  t.plan(2);

  const theError = new Error('destination error');
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue('a');
      setTimeout(function() { enqueue('b'); }, 10);
      setTimeout(function() {
        t.throws(function() { enqueue('c'); }, /TypeError/, 'enqueue after cancel must throw a TypeError');
      }, 20);
    },
    cancel: function(r) {
      t.equal(r, theError, 'reason passed to cancel equals the source error');
    }
  });

  const ws = new WritableStream({
    write: function(chunk) {
      if (chunk === 'b') {
        throw theError;
      }
    }
  });

  rs.pipeTo(ws, { preventCancel: false });
});

test('Piping with { preventCancel: true } and a destination error', function(t) {
  const theError = new Error('destination error');
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue('a');
      setTimeout(function() { enqueue('b'); }, 10);
      setTimeout(function() { enqueue('c'); }, 20);
    },
    cancel: function(r) {
      t.fail('unexpected call to cancel');
      t.end();
    }
  });

  const ws = new WritableStream({
    write: function(chunk) {
      if (chunk === 'b') {
        throw theError;
      }
    }
  });

  const pipeToPromise = rs.pipeTo(ws, { preventCancel: true });

  ws.closed.catch(function() {
    setTimeout(function() {
      t.equal(rs.state, 'readable', 'source should remain readable');

      pipeToPromise.then(
        function() {
          t.fail('pipeToPromise is fulfilled');
          t.end();
        },
        function(r) {
          t.equal(r, theError, 'rejection reason of pipeToPromise is the sink error');
          t.end();
        }
      );
    }, 30);
  });
});
