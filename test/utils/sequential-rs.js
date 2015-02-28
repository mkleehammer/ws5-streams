
'use strict';

var ReadableStream = require('../../lib/readable-stream').ReadableStream;
var SequentialPullSource = require('./sequential-pull-source');

module.exports = sequentialReadableStream;

function sequentialReadableStream(limit, options) {
  const sequentialSource = new SequentialPullSource(limit, options);

  const stream = new ReadableStream({
    start: function() {
      return new Promise(function(resolve, reject) {
        sequentialSource.open(function(err) {
          if (err) {
            reject(err);
          }
          resolve();
        });
      });
    },

    pull: function(enqueue, close) {
      return new Promise(function(resolve, reject) {
        sequentialSource.read(function(err, done, chunk) {
          if (err) {
            reject(err);
          } else if (done) {
            sequentialSource.close(function(err) {
              if (err) {
                reject(err);
              }
              close();
              resolve();
            });
          } else {
            enqueue(chunk);
            resolve();
          }
        });
      });
    }
  });

  stream.source = sequentialSource;

  return stream;
}
