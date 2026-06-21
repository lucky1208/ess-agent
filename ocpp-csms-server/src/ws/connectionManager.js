var EventEmitter = require('events').EventEmitter;
var emitter = new EventEmitter();
var connections = new Map();

function register(id, ws, meta) {
  if (connections.has(id)) {
    var old = connections.get(id);
    try { old.ws.close(1000, 'Replaced by new connection'); } catch (e) {}
    emitter.emit('charger:offline', { id: id, reason: 'replaced' });
  }
  connections.set(id, {
    ws: ws,
    meta: Object.assign({ connectedAt: new Date().toISOString(), lastHeartbeat: new Date().toISOString(), remoteAddress: ws._socket ? ws._socket.remoteAddress : 'unknown' }, meta || {})
  });
  emitter.emit('charger:online', { id: id, meta: connections.get(id).meta });
}

function unregister(id) {
  if (connections.has(id)) {
    connections.delete(id);
    emitter.emit('charger:offline', { id: id, reason: 'disconnected' });
  }
}

function get(id) {
  var entry = connections.get(id);
  if (!entry) return null;
  return { id: id, status: 'online', meta: entry.meta };
}

function getAll() {
  var list = [];
  connections.forEach(function (entry, id) {
    list.push({ id: id, status: 'online', connectedAt: entry.meta.connectedAt, lastHeartbeat: entry.meta.lastHeartbeat, ip: entry.meta.remoteAddress });
  });
  return list;
}

function isOnline(id) {
  return connections.has(id);
}

function getWs(id) {
  var entry = connections.get(id);
  return entry ? entry.ws : null;
}

function updateHeartbeat(id) {
  var entry = connections.get(id);
  if (entry) entry.meta.lastHeartbeat = new Date().toISOString();
}

function on(event, listener) { emitter.on(event, listener); }
function off(event, listener) { emitter.off(event, listener); }

module.exports = { register: register, unregister: unregister, get: get, getAll: getAll, isOnline: isOnline, getWs: getWs, updateHeartbeat: updateHeartbeat, on: on, off: off, emitter: emitter };