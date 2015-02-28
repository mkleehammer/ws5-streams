
'use strict';

var typeIsObject = require('./helpers').typeIsObject;

module.exports = ByteLengthQueuingStrategy;

function ByteLengthQueuingStrategy(options) {
  options = options || {};

  var highWaterMark = Number(options.highWaterMark);

  if (Number.isNaN(highWaterMark)) {
    throw new TypeError('highWaterMark must be a number.');
  }
  if (highWaterMark < 0) {
    throw new RangeError('highWaterMark must be nonnegative.');
  }

  this._blqsHighWaterMark = highWaterMark;
}

ByteLengthQueuingStrategy.prototype = Object.create(null, {

  shouldApplyBackpressure: {
    value: function (queueSize) {
      if (!typeIsObject(this)) {
        throw new TypeError('ByteLengthQueuingStrategy.prototype.shouldApplyBackpressure can only be applied to objects');
      }
      if (!Object.prototype.hasOwnProperty.call(this, '_blqsHighWaterMark')) {
        throw new TypeError('ByteLengthQueuingStrategy.prototype.shouldApplyBackpressure can only be applied to a ' +
                            'ByteLengthQueuingStrategy');
      }

      return queueSize > this._blqsHighWaterMark;
    }
  },

  size: {
    value: function(chunk) {
    return chunk.byteLength;
    }
  }
});

