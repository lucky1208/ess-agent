module.exports = {
  PORT: process.env.PORT || 3000,
  WS_PATH: process.env.WS_PATH || '/ocpp',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  ALLOWED_CP_IDS: process.env.ALLOWED_CP_IDS || '',
  API_KEYS: process.env.API_KEYS || '',
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  HEARTBEAT_INTERVAL: parseInt(process.env.HEARTBEAT_INTERVAL) || 30000,
  HEARTBEAT_TIMEOUT: parseInt(process.env.HEARTBEAT_TIMEOUT) || 60000,
  CP_ID_REGEX: /^[A-Za-z0-9_\-]{1,64}$/,
  VERSION: '1.0.0'
};