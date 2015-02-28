
'use strict';

var WritableStream = require('../lib/writable-stream').WritableStream;
var ReadableStream = require('../lib/readable-stream').ReadableStream;

var ByteLengthQueuingStrategy = require('../lib/byte-length-queuing-strategy');
var CountQueuingStrategy = require('../lib/count-queuing-strategy');

const test = require('tape-catch');

let ExclusiveStreamReader;

test('Can get the ExclusiveStreamReader constructor indirectly', function(t) {
  t.doesNotThrow(function() {
    // It's not exposed globally, but we test a few of its properties here.
    ExclusiveStreamReader = (new ReadableStream()).getReader().constructor;
  });
  t.end();
});

function fakeReadableStream() {
  return Object.create(null, {
    closed: { get: function() { return Promise.resolve(); } },
    ready: { get: function() { return Promise.resolve(); } },
    state: { get: function() { return 'closed'; } },
    cancel: { value: function(reason) { return Promise.resolve(); } },
    getReader: { value: function() { return new ExclusiveStreamReader(new ReadableStream()); } },
    pipeThrough: { value: function(pair, options) { return pair.readable; } },
    pipeTo: { value: function(dest, options) { return Promise.resolve(); } },
    read: { value: function() { return ''; } }
  });
}

function realReadableStream() {
  return new ReadableStream();
}

function fakeWritableStream() {
  return Object.create(null, {
    closed: { get: function() { return Promise.resolve(); } },
    ready: { get: function() { return Promise.resolve(); } },
    state: { get: function() { return 'closed'; } },
    abort: { value: function(reason) { return Promise.resolve(); } },
    close: { value: function() { return Promise.resolve(); } },
    write: { value: function(chunk) { return Promise.resolve(); } }
  });
}

function realWritableStream() {
  return new WritableStream();
}

function fakeExclusiveStreamReader() {
  return Object.create(null, {
    closed: { get: function() { return Promise.resolve(); } },
    isActive: { get: function() { return false; } },
    ready: { get: function() { return Promise.resolve(); } },
    state: { get: function() { return 'closed'; } },
    cancel: { value: function(reason) { return Promise.resolve(); } },
    read: { value: function() { return ''; } },
    releaseLock: { value: function() { return; } }
  });
}

function fakeByteLengthQueuingStrategy() {
  return {
    shouldApplyBackpressure: function(queueSize) {
      return queueSize > 1;
    },
    size: function(chunk) {
      return chunk.byteLength;
    }
  };
}

function realByteLengthQueuingStrategy() {
  return new ByteLengthQueuingStrategy({ highWaterMark: 1 });
}

function fakeCountQueuingStrategy() {
  return {
    shouldApplyBackpressure: function(queueSize) {
      return queueSize > 1;
    },
    size: function(chunk) {
      return 1;
    }
  };
}

function realCountQueuingStrategy() {
  return new CountQueuingStrategy({ highWaterMark: 1 });
}

function getterRejects(t, obj, getterName, target) {
  const getter = Object.getOwnPropertyDescriptor(obj, getterName).get;

  getter.call(target).then(
    function() { t.fail(getterName + ' should not fulfill'); },
    function(e) { t.equal(e.constructor, TypeError, getterName + ' should reject with a TypeError'); }
  );
}

function methodRejects(t, obj, methodName, target) {
  const method = obj[methodName];

  method.call(target).then(
    function() { t.fail(methodName + ' should not fulfill'); },
    function(e) { t.equal(e.constructor, TypeError, methodName + ' should reject with a TypeError'); }
  );
}

function getterThrows(t, obj, getterName, target) {
  const getter = Object.getOwnPropertyDescriptor(obj, getterName).get;

  t.throws(function() { getter.call(target); }, /TypeError/, getterName + ' should throw a TypeError');
}

function methodThrows(t, obj, methodName, target) {
  const method = obj[methodName];

  t.throws(function() { method.call(target); }, /TypeError/, methodName + ' should throw a TypeError');
}

test('ReadableStream.prototype.closed enforces a brand check', function(t) {
  t.plan(2);
  getterRejects(t, ReadableStream.prototype, 'closed', fakeReadableStream());
  getterRejects(t, ReadableStream.prototype, 'closed', realWritableStream());
});

test('ReadableStream.prototype.ready enforces a brand check', function(t) {
  t.plan(2);
  getterRejects(t, ReadableStream.prototype, 'ready', fakeReadableStream());
  getterRejects(t, ReadableStream.prototype, 'ready', realWritableStream());
});

test('ReadableStream.prototype.state enforces a brand check', function(t) {
  t.plan(2);
  getterThrows(t, ReadableStream.prototype, 'state', fakeReadableStream());
  getterThrows(t, ReadableStream.prototype, 'state', realWritableStream());
});

test('ReadableStream.prototype.cancel enforces a brand check', function(t) {
  t.plan(2);
  methodRejects(t, ReadableStream.prototype, 'cancel', fakeReadableStream());
  methodRejects(t, ReadableStream.prototype, 'cancel', realWritableStream());
});

test('ReadableStream.prototype.getReader enforces a brand check', function(t) {
  t.plan(2);
  methodThrows(t, ReadableStream.prototype, 'getReader', fakeReadableStream());
  methodThrows(t, ReadableStream.prototype, 'getReader', realWritableStream());
});

test('ReadableStream.prototype.pipeThrough works generically on its this and its arguments', function(t) {
  t.plan(2);

  let pipeToArguments;
  const thisValue = {
    pipeTo: function() {
      pipeToArguments = Array.prototype.slice.call(arguments, 0);
    }
  };

  const input = { readable: {}, writable: {} };
  const options = {};
  const result = ReadableStream.prototype.pipeThrough.call(thisValue, input, options);

  t.deepEqual(pipeToArguments, [input.writable, options], 'correct arguments should be passed to thisValue.pipeTo');
  t.equal(result, input.readable, 'return value should be the passed readable property');
});

test('ReadableStream.prototype.pipeTo works generically on its this and its arguments', function(t) {
  t.plan(1);

  // TODO: expand this with a full fake that records what happens to it?

  t.doesNotThrow(function () { ReadableStream.prototype.pipeTo.call(fakeReadableStream(), fakeWritableStream()); });
});

test('ReadableStream.prototype.read enforces a brand check', function(t) {
  t.plan(2);
  methodThrows(t, ReadableStream.prototype, 'read', fakeReadableStream());
  methodThrows(t, ReadableStream.prototype, 'read', realWritableStream());
});


test('ExclusiveStreamReader enforces a brand check on its argument', function(t) {
  t.plan(1);
  t.throws(function() { new ExclusiveStreamReader(fakeReadableStream()); }, /TypeError/, 'Contructing an ExclusiveStreamReader ' +
           'should throw');
});

test('ExclusiveStreamReader.prototype.closed enforces a brand check', function(t) {
  t.plan(1);
  getterRejects(t, ExclusiveStreamReader.prototype, 'closed', fakeExclusiveStreamReader());
});

test('ExclusiveStreamReader.prototype.isActive enforces a brand check', function(t) {
  t.plan(1);
  getterThrows(t, ExclusiveStreamReader.prototype, 'isActive', fakeExclusiveStreamReader());
});

test('ExclusiveStreamReader.prototype.ready enforces a brand check', function(t) {
  t.plan(1);
  getterRejects(t, ExclusiveStreamReader.prototype, 'ready', fakeExclusiveStreamReader());
});

test('ExclusiveStreamReader.prototype.state enforces a brand check', function(t) {
  t.plan(1);
  getterThrows(t, ExclusiveStreamReader.prototype, 'state', fakeExclusiveStreamReader());
});

test('ExclusiveStreamReader.prototype.cancel enforces a brand check', function(t) {
  t.plan(1);
  methodRejects(t, ExclusiveStreamReader.prototype, 'cancel', fakeExclusiveStreamReader());
});

test('ExclusiveStreamReader.prototype.read enforces a brand check', function(t) {
  t.plan(1);
  methodThrows(t, ExclusiveStreamReader.prototype, 'read', fakeExclusiveStreamReader());
});

test('ExclusiveStreamReader.prototype.releaseLock enforces a brand check', function(t) {
  t.plan(1);
  methodThrows(t, ExclusiveStreamReader.prototype, 'releaseLock', fakeExclusiveStreamReader());
});


test('WritableStream.prototype.closed enforces a brand check', function(t) {
  t.plan(2);
  getterRejects(t, WritableStream.prototype, 'closed', fakeWritableStream());
  getterRejects(t, WritableStream.prototype, 'closed', realReadableStream());
});

test('WritableStream.prototype.ready enforces a brand check', function(t) {
  t.plan(2);
  getterRejects(t, WritableStream.prototype, 'ready', fakeWritableStream());
  getterRejects(t, WritableStream.prototype, 'ready', realReadableStream());
});

test('WritableStream.prototype.state enforces a brand check', function(t) {
  t.plan(2);
  getterThrows(t, WritableStream.prototype, 'state', fakeWritableStream());
  getterThrows(t, WritableStream.prototype, 'state', realReadableStream());
});

test('WritableStream.prototype.abort enforces a brand check', function(t) {
  t.plan(2);
  methodRejects(t, WritableStream.prototype, 'abort', fakeWritableStream());
  methodRejects(t, WritableStream.prototype, 'abort', realReadableStream());
});

test('WritableStream.prototype.write enforces a brand check', function(t) {
  t.plan(2);
  methodRejects(t, WritableStream.prototype, 'write', fakeWritableStream());
  methodRejects(t, WritableStream.prototype, 'write', realReadableStream());
});

test('WritableStream.prototype.close enforces a brand check', function(t) {
  t.plan(2);
  methodRejects(t, WritableStream.prototype, 'close', fakeWritableStream());
  methodRejects(t, WritableStream.prototype, 'close', realReadableStream());
});


test('ByteLengthQueuingStrategy.prototype.shouldApplyBackpressure enforces a brand check', function(t) {
  t.plan(2);
  methodThrows(t, ByteLengthQueuingStrategy.prototype, 'shouldApplyBackpressure', fakeByteLengthQueuingStrategy());
  methodThrows(t, ByteLengthQueuingStrategy.prototype, 'shouldApplyBackpressure', realCountQueuingStrategy());
});

test('ByteLengthQueuingStrategy.prototype.size should work generically on its this and its arguments', function(t) {
  t.plan(1);
  const thisValue = null;
  const returnValue = { 'returned from': 'byteLength getter' };
  const chunk = {
    get byteLength() {
      return returnValue;
    }
  };

  t.equal(ByteLengthQueuingStrategy.prototype.size.call(thisValue, chunk), returnValue);
});

test('CountQueuingStrategy.prototype.shouldApplyBackpressure enforces a brand check', function(t) {
  t.plan(2);
  methodThrows(t, CountQueuingStrategy.prototype, 'shouldApplyBackpressure', fakeCountQueuingStrategy());
  methodThrows(t, CountQueuingStrategy.prototype, 'shouldApplyBackpressure', realByteLengthQueuingStrategy());
});

test('CountQueuingStrategy.prototype.size should work generically on its this and its arguments', function(t) {
  t.plan(1);
  const thisValue = null;
  const chunk = {
    get byteLength() {
      throw new TypeError('shouldn\'t be called');
    }
  };

  t.equal(CountQueuingStrategy.prototype.size.call(thisValue, chunk), 1);
});
