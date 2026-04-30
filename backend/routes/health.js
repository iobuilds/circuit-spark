const express = require('express');
const router = express.Router();
const { compileQueue } = require('../queue/compileQueue');
const { execSync } = require('child_process');
const config = require('../config');

router.get('/', async (req, res) => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      compileQueue.getWaitingCount(),
      compileQueue.getActiveCount(),
      compileQueue.getCompletedCount(),
      compileQueue.getFailedCount(),
    ]);

    let cliVersion = 'unknown';
    try { cliVersion = execSync(`${config.ARDUINO_CLI_PATH} version`).toString().trim(); } catch(e) {}

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date(),
      queue: { waiting, active, completed, failed },
      cliVersion,
      concurrency: config.MAX_CONCURRENT_JOBS,
      cacheEnabled: config.CACHE_ENABLED,
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
