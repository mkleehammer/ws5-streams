
'use strict';

const test = require('tape-catch');

var WritableStream = require('../lib/writable-stream').WritableStream;
var ReadableStream = require('../lib/readable-stream').ReadableStream;
var TransformStream = require('../lib/transform-stream').TransformStream;

var sequentialReadableStream = require('./utils/sequential-rs');
var duckTypedPassThroughTransform = require('./utils/duck-typed-pass-through-transform');
var readableStreamToArray = require('./utils/readable-stream-to-array');

test('Piping through a duck-typed pass-through transform stream works', function(t) {
  t.plan(1);

  const readableEnd = sequentialReadableStream(5).pipeThrough(duckTypedPassThroughTransform());

  readableStreamToArray(readableEnd).then(function(chunks) { t.deepEqual(chunks, [1, 2, 3, 4, 5]); });
});

test('Piping through an identity transform stream will close the destination when the source closes', function(t) {
  t.plan(2);

  const rs = new ReadableStream({
    start: function(enqueue, close) {
      enqueue('a');
      enqueue('b');
      enqueue('c');
      close();
    }
  });

  const ts = new TransformStream({
    transform: function(chunk, enqueue, done) {
      enqueue(chunk);
      done();
    }
  });

  const ws = new WritableStream();

  rs.pipeThrough(ts).pipeTo(ws).then(function() {
    t.equal(rs.state, 'closed', 'the readable stream was closed');
    t.equal(ws.state, 'closed', 'the writable stream was closed');
  });
});

// FIXME: expected results here will probably change as we fix https://github.com/whatwg/streams/issues/190
// As they are now they don't make very much sense, so we will skip the test. When #190 is fixed, we should fix the
// test and re-enable.
test.skip('Piping through a default transform stream causes backpressure to be exerted after some delay', function(t) {
  t.plan(2);

  // Producer: every 20 ms
  const enqueueReturnValues = [];
  const rs = new ReadableStream({
    start: function(enqueue, close) {
      setTimeout(function() { enqueueReturnValues.push(enqueue('a')); }, 10);
      setTimeout(function() { enqueueReturnValues.push(enqueue('b')); }, 30);
      setTimeout(function() { enqueueReturnValues.push(enqueue('c')); }, 50);
      setTimeout(function() { enqueueReturnValues.push(enqueue('d')); }, 70);
      setTimeout(function() { enqueueReturnValues.push(enqueue('e')); }, 90);
      setTimeout(function() { enqueueReturnValues.push(enqueue('f')); }, 110);
      setTimeout(function() { enqueueReturnValues.push(enqueue('g')); }, 130);
      setTimeout(function() { enqueueReturnValues.push(enqueue('h')); }, 150);
      setTimeout(function() { close(); }, 170);
    }
  });

  const ts = new TransformStream({
    transform: function(chunk, enqueue, done) {
      enqueue(chunk);
      done();
    }
  });

  // Consumer: every 90 ms
  const writtenValues = [];
  const ws = new WritableStream({
    write: function(chunk) {
      return new Promise(function(resolve) {
        setTimeout(function() {
          writtenValues.push(chunk);
          resolve();
        }, 90);
      });
    }
  });

  setTimeout(function() {
    rs.pipeThrough(ts).pipeTo(ws).then(function() {
      t.deepEqual(
        enqueueReturnValues,
        [true, true, true, true, false, false, false, false],
        'backpressure was correctly exerted at the source');
      t.deepEqual(writtenValues, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'all chunks were written');
    });
  }, 0);
});
