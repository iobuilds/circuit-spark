require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  ARDUINO_CLI_PATH: process.env.ARDUINO_CLI_PATH || 'arduino-cli',
  COMPILE_TIMEOUT_MS: parseInt(process.env.COMPILE_TIMEOUT_MS) || 90000,
  MAX_CONCURRENT_JOBS: parseInt(process.env.MAX_CONCURRENT_JOBS) || 4,
  TEMP_DIR: process.env.TEMP_DIR || '/tmp/embedsim',
  CLEANUP_AFTER_MS: parseInt(process.env.CLEANUP_AFTER_MS) || 600000,
  CACHE_ENABLED: process.env.CACHE_ENABLED !== 'false',
  CACHE_TTL_SECONDS: parseInt(process.env.CACHE_TTL_SECONDS) || 3600,
  COMPILE_RATE_LIMIT_WINDOW_MS: 60000,
  COMPILE_RATE_LIMIT_MAX: parseInt(process.env.COMPILE_RATE_LIMIT_MAX) || 10,
  JOB_ATTEMPTS: 2,
  JOB_BACKOFF_MS: 3000,
  STALLED_INTERVAL_MS: 30000,
};
