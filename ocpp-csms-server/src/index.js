var express = require('express');
var http = require('http');
var https = require('https');
var fs = require('fs');
var cors = require('cors');
var config = require('./config');
var apiRouter = require('./api/router');
var { createWSServer } = require('./ws/server');
var { rateLimit } = require('./middleware/rateLimit');
var { apiKeyAuth } = require('./middleware/auth');

var app = express();

app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60000, max: 120 }));
app.use('/api', apiKeyAuth);
app.use('/api', apiRouter);

var server;
if (process.env.SSL_CERT && process.env.SSL_KEY) {
  var sslOpts = {
    cert: fs.readFileSync(process.env.SSL_CERT),
    key: fs.readFileSync(process.env.SSL_KEY)
  };
  server = https.createServer(sslOpts, app);
} else {
  server = http.createServer(app);
}

createWSServer(server);

var PORT = config.PORT;
server.listen(PORT, function () {
  console.log('========================================');
  console.log('  OCPP CSMS Server v' + config.VERSION);
  console.log('  HTTP:   http://localhost:' + PORT);
  console.log('  WS:     ws://localhost:' + PORT + config.WS_PATH + '/{chargePointId}');
  console.log('  API:    http://localhost:' + PORT + '/api/chargers');
  console.log('  Health: http://localhost:' + PORT + '/api/health');
  console.log('========================================');
});

module.exports = { app: app, server: server };