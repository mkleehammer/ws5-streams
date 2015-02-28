
'use strict';

exports.promiseCall = promiseCall;
exports.typeIsObject = typeIsObject;
exports.toInteger = toInteger;
exports.InvokeOrNoop = InvokeOrNoop;
exports.PromiseInvokeOrNoop = PromiseInvokeOrNoop;
exports.PromiseInvokeOrFallbackOrNoop = PromiseInvokeOrFallbackOrNoop;

function promiseCall(func) {
  var args = Array.prototype.splice.call(arguments, 1);

  try {
    return Promise.resolve(func.apply(null, args));
  } catch (e) {
    return Promise.reject(e);
  }
}

function typeIsObject(x) {
  return (typeof x === 'object' && x !== null) || typeof x === 'function';
}

function toInteger(v) {
  v = Number(v);
  if (isNaN(v)) {
    return 0;
  }

  if (v < 0) {
    return -1 * Math.floor(Math.abs(v));
  }

  return Math.floor(Math.abs(v));
}

function InvokeOrNoop(O, P, args) {
  const method = O[P];
  if (method === undefined) {
    return undefined;
  }
  return method.apply(O, args);
}

function PromiseInvokeOrNoop(O, P, args) {
  let method;
  try {
    method = O[P];
  } catch (methodE) {
    return Promise.reject(methodE);
  }

  if (method === undefined) {
    return Promise.resolve(undefined);
  }

  try {
    return Promise.resolve(method.apply(O, args));
  } catch (e) {
    return Promise.reject(e);
  }
}

function PromiseInvokeOrFallbackOrNoop(O, P1, args1, P2, args2) {
  let method;
  try {
    method = O[P1];
  } catch (methodE) {
    return Promise.reject(methodE);
  }

  if (method === undefined) {
    return PromiseInvokeOrNoop(O, P2, args2);
  }

  try {
    return Promise.resolve(method.apply(O, args1));
  } catch (e) {
    return Promise.reject(e);
  }
}
