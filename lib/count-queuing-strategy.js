
'use strict'

module.exports = CountQueuingStrategy;

var typeIsObject = require('./helpers').typeIsObject;

function CountQueuingStrategy(options) {
  options = options || {};

  var highWaterMark = Number(options.highWaterMark);

  if (Number.isNaN(highWaterMark)) {
    throw new TypeError('highWaterMark must be a number.');
  }
  if (highWaterMark < 0) {
    throw new RangeError('highWaterMark must be nonnegative.');
  }

  this._cqsHighWaterMark = highWaterMark;
}

CountQueuingStrategy.prototype = Object.create(null, {
  shouldApplyBackpressure: {
    value: function(queueSize) {
      if (!typeIsObject(this)) {
        throw new TypeError('CountQueuingStrategy.prototype.shouldApplyBackpressure can only be applied to objects');
      }
      if (!Object.prototype.hasOwnProperty.call(this, '_cqsHighWaterMark')) {
        throw new TypeError('CountQueuingStrategy.prototype.shouldApplyBackpressure can only be applied to a ' +
                            'CountQueuingStrategy');
      }

      return queueSize > this._cqsHighWaterMark;
    }
  },

  size: {
    value: function(chunk) {
      return 1;
    }
  }
});
