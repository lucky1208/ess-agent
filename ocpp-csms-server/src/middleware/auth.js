var config = require('../config');

function apiKeyAuth(req, res, next) {
  if (!config.API_KEYS) return next();
  var keys = config.API_KEYS.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (keys.length === 0) return next();
  var authHeader = req.headers['authorization'];
  var apiKey = req.headers['x-api-key'];
  var token = authHeader ? authHeader.replace('Bearer ', '') : apiKey;
  if (!token || keys.indexOf(token) === -1) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { apiKeyAuth: apiKeyAuth };