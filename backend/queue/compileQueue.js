const Bull = require('bull');
const config = require('../config');
const logger = require('../utils/logger');

const compileQueue = new Bull('compile', {
  redis: config.REDIS_URL,
  defaultJobOptions: {
    attempts: config.JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: config.JOB_BACKOFF_MS },
    removeOnComplete: 100,
    removeOnFail: 200,
    timeout: config.COMPILE_TIMEOUT_MS + 15000,
  },
  settings: {
    stalledInterval: config.STALLED_INTERVAL_MS,
    maxStalledCount: 1,
  }
});

compileQueue.on('error', (err) => logger.error('Queue error:', err.message));
compileQueue.on('stalled', (job) => logger.warn(`Job ${job.id} stalled`));
compileQueue.on('failed', (job, err) => logger.error(`Job ${job.id} failed: ${err.message}`));

module.exports = { compileQueue };
