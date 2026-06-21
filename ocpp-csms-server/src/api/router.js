var express = require('express');
var router = express.Router();
var connMgr = require('../ws/connectionManager');
var pendingReqs = require('../ocpp/pendingRequests');
var config = require('../config');
var schemas16 = require('../ocpp/schemas16');
var schemas201 = require('../ocpp/schemas201');

router.get('/chargers', function (req, res) {
  var list = connMgr.getAll();
  res.json(list);
});

router.post('/chargers/:id/command', function (req, res) {
  var cpId = req.params.id;
  var action = req.body.action;
  var payload = req.body.payload || {};

  if (!connMgr.isOnline(cpId)) {
    return res.status(404).json({ status: 'error', message: 'Charger ' + cpId + ' is not online' });
  }

  var allActions = Object.keys(schemas16).concat(Object.keys(schemas201));
  if (allActions.indexOf(action) === -1) {
    return res.status(400).json({ status: 'error', message: 'Unknown action: ' + action });
  }

  pendingReqs.sendCommand(cpId, action, payload)
    .then(function (response) {
      res.json({ status: 'success', response: response });
    })
    .catch(function (err) {
      res.status(502).json({ status: 'error', message: err.message });
    });
});

router.get('/chargers/:id/config', function (req, res) {
  var cpId = req.params.id;
  var info = connMgr.get(cpId);
  if (!info) {
    return res.status(404).json({ error: 'Charger not found' });
  }
  var host = req.get('host');
  var proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  var wsProto = proto === 'https' ? 'wss' : 'ws';
  res.json({
    wsUrl: wsProto + '://' + host + config.WS_PATH + '/' + cpId,
    protocol: info.meta.ocppVersion || '1.6J',
    status: info.status
  });
});

router.get('/events', function (req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': config.CORS_ORIGIN
  });
  res.write('data: ' + JSON.stringify({ type: 'connected' }) + '\n\n');

  function onOnline(evt) { res.write('event: charger:online\ndata: ' + JSON.stringify(evt) + '\n\n'); }
  function onOffline(evt) { res.write('event: charger:offline\ndata: ' + JSON.stringify(evt) + '\n\n'); }
  function onMessage(evt) { res.write('event: charger:message\ndata: ' + JSON.stringify(evt) + '\n\n'); }

  connMgr.on('charger:online', onOnline);
  connMgr.on('charger:offline', onOffline);
  connMgr.on('charger:message', onMessage);

  req.on('close', function () {
    connMgr.off('charger:online', onOnline);
    connMgr.off('charger:offline', onOffline);
    connMgr.off('charger:message', onMessage);
  });
});

router.get('/health', function (req, res) {
  res.json({ status: 'ok', uptime: process.uptime(), connections: connMgr.getAll().length, version: config.VERSION });
});

module.exports = router;