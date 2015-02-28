
'use strict';

var WritableStream = require('../lib/writable-stream').WritableStream;

const test = require('tape-catch');

test('Throwing underlying sink start getter', function(t) {
  const theError = new Error('a unique string');

  t.throws(function() {
    new WritableStream(Object.create(null, {
      start: {
        get: function() {
          throw theError;
        }
      }
    }));
  }, /a unique string/);
  t.end();
});

test('Throwing underlying sink start method', function(t) {
  const theError = new Error('a unique string');

  t.throws(function()  {
    new WritableStream({
      start: function() {
        throw theError;
      }
    });
  }, /a unique string/);
  t.end();
});

test('Throwing underlying source write getter', function(t) {
  t.plan(2);

  const theError = new Error('a unique string');
  const ws = new WritableStream(Object.create(null, {
    write: { 
      get: function() {
      throw theError;
      }
    }
  }));

  ws.write('a').then(
    function() { t.fail('write should not fulfill'); },
    function(r) { t.equal(r, theError, 'write should reject with the thrown error'); }
  );

  ws.closed.then(
    function() { t.fail('closed should not fulfill'); },
    function(r) { t.equal(r, theError, 'closed should reject with the thrown error'); }
  );
});

test('Throwing underlying source write method', function(t) {
  t.plan(2);

  const theError = new Error('a unique string');
  const ws = new WritableStream({
    write: function() {
      throw theError;
    }
  });

  ws.write('a').then(
    function() { t.fail('write should not fulfill'); },
    function(r) { t.equal(r, theError, 'write should reject with the thrown error'); }
  );

  ws.closed.then(
    function() { t.fail('closed should not fulfill'); },
    function(r) { t.equal(r, theError, 'closed should reject with the thrown error'); }
  );
});

test('Throwing underlying sink abort getter', function(t) {
  t.plan(2);

  const theError = new Error('a unique string');
  const abortReason = new Error('different string');
  const ws = new WritableStream(Object.create(null, {
    abort: {
      get: function() {
        throw theError;
      }
    }
  }));

  ws.abort(abortReason).then(
    function() { t.fail('abort should not fulfill'); },
    function(r) { t.equal(r, theError, 'abort should reject with the abort reason'); }
  );

  ws.closed.then(
    function() { t.fail('closed should not fulfill'); },
    function(r) { t.equal(r, abortReason, 'closed should reject with the thrown error'); }
  );
});

test('Throwing underlying sink abort method', function(t) {
  t.plan(2);

  const theError = new Error('a unique string');
  const abortReason = new Error('different string');
  const ws = new WritableStream({
    abort: function() {
      throw theError;
    }
  });

  ws.abort(abortReason).then(
    function() { t.fail('abort should not fulfill'); },
    function(r) { t.equal(r, theError, 'abort should reject with the abort reason'); }
  );

  ws.closed.then(
    function() { t.fail('closed should not fulfill'); },
    function(r) { t.equal(r, abortReason, 'closed should reject with the thrown error'); }
  );
});

test('Throwing underlying sink close getter', function(t) {
  t.plan(1);

  const theError = new Error('a unique string');
  const ws = new WritableStream(Object.create(null, {
    close: {
      get: function() {
        throw theError;
      }
    }
  }));

  ws.close().then(
    function() { t.fail('close should not fulfill'); },
    function(r) { t.equal(r, theError, 'close should reject with the thrown error'); }
  );
});

test('Throwing underlying sink close method', function(t) {
  t.plan(1);

  const theError = new Error('a unique string');
  const ws = new WritableStream({
    close: function() {
      throw theError;
    }
  });

  ws.close().then(
    function() { t.fail('close should not fulfill'); },
    function(r) { t.equal(r, theError, 'close should reject with the thrown error'); }
  );
});

test('Throwing underlying source strategy getter: initial construction', function(t) {
  const theError = new Error('a unique string');

  t.throws(function() {
    new WritableStream(Object.create(null, {
      strategy: {
        get: function() {
          throw theError;
        }
      }
    }));
  }, /a unique string/);
  t.end();
});

test('Throwing underlying source strategy getter: first write', function(t) {
  t.plan(2);

  let counter = 0;
  const theError = new Error('a unique string');
  const ws = new WritableStream(Object.create(null, {
    strategy: {
      get: function() {
        ++counter;
        if (counter === 1) {
          return {
            size: function() {
              return 1;
            },
            shouldApplyBackpressure: function() {
              return true;
            }
          };
        }

        throw theError;
      }
    }
  }));

  ws.write('a').then(
    function() { t.fail('write should not fulfill'); },
    function(r) { t.equal(r, theError, 'write should reject with the thrown error'); }
  );

  ws.closed.then(
    function() { t.fail('closed should not fulfill'); },
    function(r) { t.equal(r, theError, 'closed should reject with the thrown error'); }
  );
});

test('Throwing underlying source strategy.size getter: initial construction', function(t) {
  t.doesNotThrow(function() {
    new WritableStream({
      strategy: Object.create(null, {
        size: {
          get: function() {
            throw new Error('boo');
          },
        },
        shouldApplyBackpressure: {
          value: function() {
            return true;
          }
        }
      })
    });
  });
  t.end();
});

test('Throwing underlying source strategy.size method: initial construction', function(t) {
  t.doesNotThrow(function() {
    new WritableStream({
      strategy: {
        size: function() {
          throw new Error('boo');
        },
        shouldApplyBackpressure: function() {
          return true;
        }
      }
    });
  });
  t.end();
});

test('Throwing underlying source strategy.size getter: first write', function(t) {
  t.plan(2);

  const theError = new Error('a unique string');
  const ws = new WritableStream({
    strategy: Object.create(null, {
      size: {
        get: function() {
          throw theError;
        },
      },
      shouldApplyBackpressure: {
        value: function() {
          return true;
        }
      }
    })
  });

  ws.write('a').then(
    function() { t.fail('write should not fulfill'); },
    function(r) { t.equal(r, theError, 'write should reject with the thrown error'); }
  );

  ws.closed.then(
    function() { t.fail('closed should not fulfill'); },
    function(r) { t.equal(r, theError, 'closed should reject with the thrown error'); }
  );
});

test('Throwing underlying source strategy.size method: first write', function(t) {
  t.plan(2);

  const theError = new Error('a unique string');
  const ws = new WritableStream({
    strategy: {
      size: function() {
        throw theError;
      },
      shouldApplyBackpressure: function() {
        return true;
      }
    }
  });

  ws.write('a').then(
    function() { t.fail('write should not fulfill'); },
    function(r) { t.equal(r, theError, 'write should reject with the thrown error'); }
  );

  ws.closed.then(
    function() { t.fail('closed should not fulfill'); },
    function(r) { t.equal(r, theError, 'closed should reject with the thrown error'); }
  );
});

test('Throwing underlying source strategy.shouldApplyBackpressure getter: initial construction', function(t) {
  const theError = new Error('a unique string');

  t.throws(function() {
    new WritableStream({
      strategy: Object.create(null, {
        size: {
          get: function() { return 1; }
        },
        shouldApplyBackpressure: {
          get: function() { throw theError; }
        }
      })
    });
  }, /a unique string/);
  t.end();
});

test('Throwing underlying source strategy.shouldApplyBackpressure method: initial construction', function(t) {
  const theError = new Error('a unique string');

  t.throws(function() {
    new WritableStream({
      strategy: {
        size: function() {
          return 1;
        },
        shouldApplyBackpressure: function() {
          throw theError;
        }
      }
    });
  }, /a unique string/);
  t.end();
});
