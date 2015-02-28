
'use strict';

const assert = require('assert');

exports.DequeueValue = DequeueValue;
exports.EnqueueValueWithSize = EnqueueValueWithSize;
exports.GetTotalQueueSize = GetTotalQueueSize;
exports.PeekQueueValue = PeekQueueValue;

function DequeueValue(queue) {
  assert(queue.length > 0, 'Spec-level failure: should never dequeue from an empty queue.');
  const pair = queue.shift();
  return pair.value;
}

function EnqueueValueWithSize(queue, value, size) {
  size = Number(size);
  if (Number.isNaN(size) || size === +Infinity || size === -Infinity) {
    throw new RangeError('Size must be a finite, non-NaN number.');
  }

  queue.push({ value: value, size: size });
}

function GetTotalQueueSize(queue) {
  let totalSize = 0;

  queue.forEach(function(pair) {
    assert(typeof pair.size === 'number' && !Number.isNaN(pair.size) &&
      pair.size !== +Infinity && pair.size !== -Infinity,
      'Spec-level failure: should never find an invalid size in the queue.');
    totalSize += pair.size;
  });

  return totalSize;
}

function PeekQueueValue(queue) {
  assert(queue.length > 0, 'Spec-level failure: should never peek at an empty queue.');
  const pair = queue[0];
  return pair.value;
}
