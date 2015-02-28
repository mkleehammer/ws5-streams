
'use strict';

var ReadableStream = require('../lib/readable-stream').ReadableStream;

const test = require('tape-catch');

test('Throwing underlying source start getter', function(t) {
  const theError = new Error('a unique string');

  t.throws(function() {
    new ReadableStream(Object.create(null, {
      start: {
        get: function() {
          throw theError;
        }
      }
    }));
  }, /a unique string/);
  t.end();
});

test('Throwing underlying source start method', function(t) {
  const theError = new Error('a unique string');

  t.throws(function() {
    new ReadableStream({
      start: function() {
        throw theError;
      }
    });
  }, /a unique string/);
  t.end();
});

test('Throwing underlying source pull getter (initial pull)', function(t) {
  t.plan(1);

  const theError = new Error('a unique string');
  const rs = new ReadableStream(Object.create(null, {
    pull: {
      get: function() {
        throw theError;
      }
    }
  }));

  rs.closed.then(
    function() { t.fail('closed should not fulfill'); },
    function(r) { t.equal(r, theError, 'closed should reject with the thrown error'); }
  );
});

test('Throwing underlying source pull method (initial pull)', function(t) {
  t.plan(1);

  const theError = new Error('a unique string');
  const rs = new ReadableStream({
    pull: function() {
      throw theError;
    }
  });

  rs.closed.then(
    function() { t.fail('closed should not fulfill'); },
    function(r) { t.equal(r, theError, 'closed should reject with the thrown error'); }
  );
});

test('Throwing underlying source pull getter (second pull)', function(t) {
  t.plan(3);

  const theError = new Error('a unique string');
  let counter = 0;
  const rs = new ReadableStream(Object.create(null, {
    pull: {
      get: function() {
      ++counter;
      if (counter === 1) {
        return function(enqueue) { enqueue('a'); };
      }

      throw theError;
      }
    }
  }));

  rs.ready.then(function() {
    t.equal(rs.state, 'readable', 'sanity check: the stream becomes readable without issue');
    t.equal(rs.read(), 'a', 'the initially-enqueued chunk can be read from the stream');
  });

  rs.closed.then(
    function() { t.fail('closed should not fulfill'); },
    function(r) { t.equal(r, theError, 'closed should reject with the thrown error'); }
  );
});

test('Throwing underlying source pull method (second pull)', function(t) {
  t.plan(3);

  const theError = new Error('a unique string');
  let counter = 0;
  const rs = new ReadableStream({
    pull: function(enqueue) {
      ++counter;
      if (counter === 1) {
        enqueue('a');
      } else {
        throw theError;
      }
    }
  });

  rs.ready.then(function() {
    t.equal(rs.state, 'readable', 'sanity check: the stream becomes readable without issue');
    t.equal(rs.read(), 'a', 'the initially-enqueued chunk can be read from the stream');
  });

  rs.closed.then(
    function() { t.fail('closed should not fulfill'); },
    function(r) { t.equal(r, theError, 'closed should reject with the thrown error'); }
  );
});

test('Throwing underlying source cancel getter', function(t) {
  t.plan(1);

  const theError = new Error('a unique string');
  const rs = new ReadableStream(Object.create(null, {
    cancel: {
      get: function() {
        throw theError;
      }
    }
  }));

  rs.cancel().then(
    function() { t.fail('cancel should not fulfill'); },
    function(r) { t.equal(r, theError, 'cancel should reject with the thrown error'); }
  );
});

test('Throwing underlying source cancel method', function(t) {
  t.plan(1);

  const theError = new Error('a unique string');
  const rs = new ReadableStream({
    cancel: function() {
      throw theError;
    }
  });

  rs.cancel().then(
    function() { t.fail('cancel should not fulfill'); },
    function(r) { t.equal(r, theError, 'cancel should reject with the thrown error'); }
  );
});

test('Throwing underlying source strategy getter', function(t) {
  t.plan(2);

  const theError = new Error('a unique string');

  const rs = new ReadableStream(Object.create(null, {
    start: {
      value: function(enqueue) {
        t.throws(function() { enqueue('a'); }, /a unique string/);
      }
    },
    strategy: {
      get: function() {
        throw theError;
      }
    }
  }));

  t.equal(rs.state, 'errored', 'state should be errored');
});

test('Throwing underlying source strategy.size getter', function(t) {
  t.plan(2);

  const theError = new Error('a unique string');
  const rs = new ReadableStream({
    start: function(enqueue) {
      t.throws(function() { enqueue('a'); }, /a unique string/);
    },
    strategy: Object.create(null, {
      size: {
        get: function() {
          throw theError;
        }
      },
      shouldApplyBackpressure: {
        value: function() {
          return true;
        }
      }
    })
  });

  t.equal(rs.state, 'errored', 'state should be errored');
});

test('Throwing underlying source strategy.size method', function(t) {
  t.plan(2);

  const theError = new Error('a unique string');
  const rs = new ReadableStream({
    start: function(enqueue) {
      t.throws(function() { enqueue('a'); }, /a unique string/);
    },
    strategy: {
      size: function() {
        throw theError;
      },
      shouldApplyBackpressure: function() {
        return true;
      }
    }
  });

  t.equal(rs.state, 'errored', 'state should be errored');
});

test('Throwing underlying source strategy.shouldApplyBackpressure getter', function(t) {
  t.plan(2);

  const theError = new Error('a unique string');
  const rs = new ReadableStream({
    start: function(enqueue) {
      t.throws(function() { enqueue('a'); }, /a unique string/);
    },
    strategy: Object.create(null, {
      size: {
        value: function() {
          return 1;
        }
      },
      shouldApplyBackpressure: {
        get: function() {
          throw theError;
        }
      }
    })
  });

  t.equal(rs.state, 'errored', 'state should be errored');
});

test('Throwing underlying source strategy.shouldApplyBackpressure method', function(t) {
  t.plan(2);

  const theError = new Error('a unique string');
  const rs = new ReadableStream({
    start: function(enqueue) {
      t.throws(function() { enqueue('a'); }, /a unique string/);
    },
    strategy: {
      size: function() {
        return 1;
      },
      shouldApplyBackpressure: function() {
        throw theError;
      }
    }
  });

  t.equal(rs.state, 'errored', 'state should be errored');
});
