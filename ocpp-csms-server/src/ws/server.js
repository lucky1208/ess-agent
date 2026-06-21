var WebSocket = require('ws');
var config = require('../config');
var connMgr = require('./connectionManager');
var protocol = require('../ocpp/protocol');
var pendingRequests = require('../ocpp/pendingRequests');

function createWSServer(httpServer) {
  var wss = new WebSocket.Server({ server: httpServer, path: config.WS_PATH });

  wss.on('connection', function (ws, req) {
    var pathParts = req.url.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      ws.close(4001, 'Invalid path: expected /ocpp/{chargePointId}');
      return;
    }
    var cpId = pathParts[pathParts.length - 1];
    if (!config.CP_ID_REGEX.test(cpId)) {
      ws.close(4002, 'Invalid chargePointId format');
      return;
    }
    var allowedIds = config.ALLOWED_CP_IDS ? config.ALLOWED_CP_IDS.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
    if (allowedIds.length > 0 && !allowedIds.some(function (prefix) { return cpId.startsWith(prefix); })) {
      ws.close(4003, 'ChargePoint ID not in whitelist');
      return;
    }

    var subprotocol = ws.protocol || '';
    var ocppVersion = subprotocol.includes('ocpp2.0') ? '2.0.1' : '1.6J';
    console.log('[WS] Charger connected: ' + cpId + ' (OCPP ' + ocppVersion + ') from ' + req.socket.remoteAddress);

    connMgr.register(cpId, ws, { ocppVersion: ocppVersion });

    ws.isAlive = true;
    ws.on('pong', function () { ws.isAlive = true; connMgr.updateHeartbeat(cpId); });

    ws.on('message', function (raw) {
      var msg = protocol.parseMessage(raw.toString());
      if (!msg) {
        console.warn('[WS] Invalid message from ' + cpId);
        return;
      }
      if (msg.type === protocol.MESSAGE_TYPE.CALL) {
        handleIncomingCall(cpId, ws, msg);
      } else if (msg.type === protocol.MESSAGE_TYPE.CALLRESULT) {
        pendingRequests.resolve(msg.uniqueId, msg.payload);
      } else if (msg.type === protocol.MESSAGE_TYPE.CALLERROR) {
        pendingRequests.reject(msg.uniqueId, msg.errorCode, msg.errorDescription);
      }
    });

    ws.on('close', function (code, reason) {
      console.log('[WS] Charger disconnected: ' + cpId + ' code=' + code);
      connMgr.unregister(cpId);
      pendingRequests.rejectAllFor(cpId);
    });

    ws.on('error', function (err) {
      console.error('[WS] Error for ' + cpId + ':', err.message);
    });
  });

  var heartbeatInterval = setInterval(function () {
    wss.clients.forEach(function (ws) {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping(function () {});
    });
  }, config.HEARTBEAT_INTERVAL);

  wss.on('close', function () { clearInterval(heartbeatInterval); });

  return wss;
}

function handleIncomingCall(cpId, ws, msg) {
  console.log('[OCPP] CALL from ' + cpId + ': ' + msg.action);
  var response;
  switch (msg.action) {
    case 'BootNotification':
      response = { status: 'Accepted', currentTime: new Date().toISOString(), interval: 300 };
      break;
    case 'Heartbeat':
      response = { currentTime: new Date().toISOString() };
      break;
    case 'StatusNotification':
      response = {};
      break;
    case 'Authorize':
      response = { idTagInfo: { status: 'Accepted' } };
      break;
    case 'StartTransaction':
      response = { idTagInfo: { status: 'Accepted' }, transactionId: Date.now() };
      break;
    case 'StopTransaction':
      response = { idTagInfo: { status: 'Accepted' } };
      break;
    case 'MeterValues':
      response = {};
      break;
    case 'FirmwareStatusNotification':
      response = {};
      break;
    case 'DiagnosticsStatusNotification':
      response = {};
      break;
    default:
      response = {};
  }
  ws.send(protocol.buildCallResult(msg.uniqueId, response));
  connMgr.emitter.emit('charger:message', { id: cpId, action: msg.action, payload: msg.payload, direction: 'CP→CS' });
}

module.exports = { createWSServer: createWSServer };