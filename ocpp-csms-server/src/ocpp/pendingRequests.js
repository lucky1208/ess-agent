var config = require('../config');
var protocol = require('./protocol');
var connMgr = require('../ws/connectionManager');

var pending = new Map();

function sendCommand(cpId, action, payload) {
  return new Promise(function (resolve, reject) {
    var ws = connMgr.getWs(cpId);
    if (!ws || ws.readyState !== 1) {
      return reject(new Error('Charger ' + cpId + ' is not online'));
    }
    var rawMsg = protocol.buildCall(action, payload);
    var parsed = JSON.parse(rawMsg);
    var uniqueId = parsed[1];

    var timer = setTimeout(function () {
      pending.delete(uniqueId);
      reject(new Error('Request timeout for ' + action + ' to ' + cpId));
    }, config.REQUEST_TIMEOUT);

    pending.set(uniqueId, { cpId: cpId, resolve: resolve, reject: reject, timer: timer });
    ws.send(rawMsg);
  });
}

function resolve(uniqueId, payload) {
  var entry = pending.get(uniqueId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(uniqueId);
  entry.resolve(payload);
}

function reject(uniqueId, errorCode, errorDescription) {
  var entry = pending.get(uniqueId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(uniqueId);
  entry.reject(new Error(errorCode + ': ' + errorDescription));
}

function rejectAllFor(cpId) {
  pending.forEach(function (entry, uniqueId) {
    if (entry.cpId === cpId) {
      clearTimeout(entry.timer);
      pending.delete(uniqueId);
      entry.reject(new Error('Connection lost for ' + cpId));
    }
  });
}

module.exports = { sendCommand: sendCommand, resolve: resolve, reject: reject, rejectAllFor: rejectAllFor };