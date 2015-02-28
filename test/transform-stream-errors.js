
'use strict';

var TransformStream = require('../lib/transform-stream').TransformStream;

const test = require('tape-catch');

test('TransformStream errors thrown in transform put the writable and readable in an errored state', function(t) {
  t.plan(9);

  const thrownError = new Error('bad things are happening!');
  const ts = new TransformStream({
    transform: function() {
      throw thrownError;
    }
  });

  t.equal(ts.readable.state, 'waiting', 'readable starts in waiting');
  t.equal(ts.writable.state, 'writable', 'writable starts in writable');

  ts.writable.write('a');

  t.equal(ts.readable.state, 'waiting', 'readable stays in waiting immediately after throw');
  t.equal(ts.writable.state, 'waiting', 'writable stays in waiting immediately after throw');

  setTimeout(function() {
    t.equal(ts.readable.state, 'errored', 'readable becomes errored after writing to the throwing transform');
    t.equal(ts.writable.state, 'errored', 'writable becomes errored after writing to the throwing transform');

    try {
      ts.readable.read();
      t.fail('read() didn\'nt throw');
    } catch (error) {
      t.equal(error, thrownError, 'readable\'s read should throw the thrown error');
    }
  }, 0);

  ts.readable.closed.then(
    function() { t.fail('readable\'s closed should not be fulfilled'); },
    function(e) { t.equal(e, thrownError, 'readable\'s closed should be rejected with the thrown error'); }
  );

  ts.writable.closed.then(
    function() { t.fail('writable\'s closed should not be fulfilled'); },
    function(e) { t.equal(e, thrownError, 'writable\'s closed should be rejected with the thrown error'); }
  );
});

test('TransformStream errors thrown in flush put the writable and readable in an errored state', function(t) {
  t.plan(11);

  const thrownError = new Error('bad things are happening!');
  const ts = new TransformStream({
    transform: function(chunk, enqueue, done) {
      done();
    },
    flush: function() {
      throw thrownError;
    }
  });

  t.equal(ts.readable.state, 'waiting', 'readable starts in waiting');
  t.equal(ts.writable.state, 'writable', 'writable starts in writable');

  ts.writable.write('a');

  t.equal(ts.readable.state, 'waiting', 'readable stays in waiting after a write');
  t.equal(ts.writable.state, 'waiting', 'writable stays in waiting after a write');

  ts.writable.close();

  t.equal(ts.readable.state, 'waiting', 'readable stays in waiting immediately after a throw');
  t.equal(ts.writable.state, 'closing', 'writable becomes closing immediately after a throw');

  setTimeout(function() {
    t.equal(ts.readable.state, 'errored', 'readable becomes errored after closing with the throwing flush');
    t.equal(ts.writable.state, 'errored', 'writable becomes errored after closing with the throwing flush');

    try {
      ts.readable.read();
      t.fail('read() didn\'nt throw');
    } catch (error) {
      t.equal(error, thrownError, 'readable\'s read should throw the thrown error');
    }
  }, 0);

  ts.readable.closed.then(
    function() { t.fail('readable\'s closed should not be fulfilled'); },
    function(e) { t.equal(e, thrownError, 'readable\'s closed should be rejected with the thrown error'); }
  );

  ts.writable.closed.then(
    function() { t.fail('writable\'s closed should not be fulfilled'); },
    function(e) { t.equal(e, thrownError, 'writable\'s closed should be rejected with the thrown error'); }
  );
});
