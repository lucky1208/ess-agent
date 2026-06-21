var rateLimitMap = new Map();

function rateLimit(options) {
  var windowMs = options.windowMs || 60000;
  var max = options.max || 60;
  return function (req, res, next) {
    var ip = req.ip || req.connection.remoteAddress;
    var now = Date.now();
    var entry = rateLimitMap.get(ip);
    if (!entry || now - entry.resetTime > windowMs) {
      entry = { count: 0, resetTime: now };
      rateLimitMap.set(ip, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}

module.exports = { rateLimit: rateLimit };