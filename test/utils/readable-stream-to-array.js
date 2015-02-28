
'use strict';

module.exports = readableStreamToArray;

function readableStreamToArray(readable) {
  const chunks = [];

  pump();
  return readable.closed.then(function() { return chunks; });

  function pump() {
    while (readable.state === "readable") {
      chunks.push(readable.read());
    }

    if (readable.state === "waiting") {
      readable.ready.then(pump);
    }
    
    // Otherwise the stream is "closed" or "errored", which will be handled above.
  }
}
