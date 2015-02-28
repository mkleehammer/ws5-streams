
'use strict';

var WritableStream = require('../lib/writable-stream').WritableStream;

const test = require('tape-catch');

test('Aborting a WritableStream immediately prevents future writes', function(t) {
  const chunks = [];
  const ws = new WritableStream({
    write: function(chunk) {
      chunks.push(chunk);
    }
  });

  setTimeout(function() {
    ws.abort();
    ws.write(1);
    ws.write(2);
    t.deepEqual(chunks, [], 'no chunks are written');
    t.end();
  }, 0);
});

test('Aborting a WritableStream prevents further writes after any that are in progress', function(t) {
  const chunks = [];
  const ws = new WritableStream({
    write: function(chunk) {
      chunks.push(chunk);
      return new Promise(function(resolve) { setTimeout(resolve, 50); });
    }
  });

  setTimeout(function() {
    ws.write(1);
    ws.write(2);
    ws.write(3);
    ws.abort();
    ws.write(4);
    ws.write(5);

    setTimeout(function () {
      t.deepEqual(chunks, [1], 'only the single in-progress chunk gets written');
      t.end();
    }, 200);
  }, 0);
});

test('Fulfillment value of ws.abort() call must be undefined even if the underlying sink returns a non-undefined value', function(t) {
  const ws = new WritableStream({
    abort: function() {
      return 'Hello';
    }
  });

  const abortPromise = ws.abort('a');
  abortPromise.then(function(value) {
    t.equal(value, undefined, 'fulfillment value must be undefined');
    t.end();
  }).catch(function() {
    t.fail('abortPromise is rejected');
    t.end();
  });
});

test('WritableStream if sink\'s abort throws, the promise returned by ws.abort() rejects', function(t) {
  const errorInSinkAbort = new Error('Sorry, it just wasn\'t meant to be.');
  const ws = new WritableStream({
    abort: function() {
      throw errorInSinkAbort;
    }
  });

  const abortPromise = ws.abort(undefined);
  abortPromise.then(
    function() {
      t.fail('abortPromise is fulfilled unexpectedly');
      t.end();
    },
    function(r) {
      t.equal(r, errorInSinkAbort, 'rejection reason of abortPromise must be errorInSinkAbort');
      t.end();
    }
  );
});

test('Aborting a WritableStream passes through the given reason', function(t) {
  let recordedReason;
  const ws = new WritableStream({
    abort: function(reason) {
      recordedReason = reason;
    }
  });

  const passedReason = new Error('Sorry, it just wasn\'t meant to be.');
  ws.abort(passedReason);

  t.equal(recordedReason, passedReason);
  t.end();
});

test('Aborting a WritableStream puts it in an errored state, with stored error equal to the abort reason', function(t) {
  t.plan(5);

  let recordedReason;
  const ws = new WritableStream();

  const passedReason = new Error('Sorry, it just wasn\'t meant to be.');
  ws.abort(passedReason);

  t.equal(ws.state, 'errored', 'state should be errored');

  ws.write().then(
    function() { t.fail('writing should not succeed'); },
    function(r) { t.equal(r, passedReason, 'writing should reject with the given reason'); }
  );

  ws.close().then(
    function() { t.fail('closing should not succeed'); },
    function(r) { t.equal(r, passedReason, 'closing should reject with the given reason'); }
  );

  ws.abort().then(
    function() { t.fail('aborting a second time should not succeed'); },
    function(r) { t.equal(r, passedReason, 'aborting a second time should reject with the given reason'); }
  );

  ws.closed.then(
    function() { t.fail('closed promise should not be fulfilled'); },
    function(r) { t.equal(r, passedReason, 'closed promise should be rejected with the given reason'); }
  );
});

test('Aborting a WritableStream causes any outstanding ready promises to be fulfilled immediately', function(t) {
  t.plan(2);

  let recordedReason;
  const ws = new WritableStream({
    write: function(chunk) {
      return new Promise(function() {}); // forever-pending, so normally .ready would not fulfill.
    }
  });
  ws.write('a');
  t.equal(ws.state, 'waiting', 'state should be waiting');

  ws.ready.then(function() {
    t.equal(ws.state, 'errored', 'state should now be errored');
  });

  const passedReason = new Error('Sorry, it just wasn\'t meant to be.');
  ws.abort(passedReason);
});

test('Aborting a WritableStream causes any outstanding write() promises to be rejected with the abort reason', function(t) {
  t.plan(1);

  const ws = new WritableStream();

  ws.write('a').then(
    function() { t.fail('writing should not succeed'); },
    function(r) { t.equal(r, passedReason, 'writing should reject with the given reason'); }
  );

  const passedReason = new Error('Sorry, it just wasn\'t meant to be.');
  ws.abort(passedReason);
});

test('Closing but then immediately aborting a WritableStream causes the stream to error', function(t) {
  t.plan(2);

  const ws = new WritableStream();

  ws.close();

  const passedReason = new Error('Sorry, it just wasn\'t meant to be.');
  ws.abort(passedReason);

  t.equal(ws.state, 'errored');

  ws.closed.then(
    function() { t.fail('the stream should not close successfully'); },
    function(r) { t.equal(r, passedReason, 'the stream should be errored with the given reason'); }
  );
});

test('Closing a WritableStream and aborting it while it closes causes the stream to error', function(t) {
  t.plan(3);

  const ws = new WritableStream({
    close: function() {
      return new Promise(function() {}); // forever-pending
    }
  });

  ws.close();

  const passedReason = new Error('Sorry, it just wasn\'t meant to be.');

  setTimeout(function() {
    t.equal(ws.state, 'closing');

    ws.abort(passedReason);

    t.equal(ws.state, 'errored');
  }, 20);

  ws.closed.then(
    function() { t.fail('the stream should not close successfully'); },
    function(r) { t.equal(r, passedReason, 'the stream should be errored with the given reason'); }
  );
});

test('Aborting a WritableStream after it is closed is a no-op', function(t) {
  t.plan(3);

  const ws = new WritableStream();

  ws.close();

  setTimeout(function() {
    t.equal(ws.state, 'closed');

    ws.abort().then(
      function(v) { t.equal(v, undefined, 'abort promise should fulfill with undefined'); },
      t.error
    );

    t.equal(ws.state, 'closed', 'state stays closed');
  }, 0);
});

test('WritableStream should call underlying sink\'s close if no abort is supplied', function(t) {
  t.plan(1);

  const ws = new WritableStream({
    close: function() {
      t.equal(arguments.length, 0, 'close() was called (with no arguments)');
    }
  });

  ws.abort();
});
