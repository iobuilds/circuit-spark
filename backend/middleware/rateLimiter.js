const rateLimit = require('express-rate-limit');
const config = require('../config');

module.exports = {
  compile: rateLimit({
    windowMs: config.COMPILE_RATE_LIMIT_WINDOW_MS,
    max: config.COMPILE_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many compile requests. Please wait a moment.' },
    keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
  }),

  libraries: rateLimit({
    windowMs: 60000,
    max: 30,
    message: { error: 'Too many library requests.' },
  }),
};
