const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { validateCompile } = require('../middleware/validator');
const logger = require('../utils/logger');

// POST /api/compile — submit job, return jobId immediately
router.post('/', validateCompile, async (req, res) => {
  const { board, files, libraries, clientId } = req.body;
  const compileQueue = req.app.get('compileQueue');
  const io = req.app.get('io');

  try {
    const job = await compileQueue.add(
      { board, files, libraries, clientId, submittedAt: Date.now() },
      { jobId: uuidv4() }
    );

    logger.info(`Compile job ${job.id} queued for board: ${board}`);

    // Listen for job completion and emit via socket
    job.finished().then((result) => {
      io.to(`job:${job.id}`).emit('compile:done', { jobId: job.id, result });
    }).catch((err) => {
      io.to(`job:${job.id}`).emit('compile:error', {
        jobId: job.id,
        error: err.message,
        errors: [{ file: 'sketch.ino', line: 1, col: 1, severity: 'error', message: err.message }]
      });
    });

    // Poll for progress and emit updates
    const pollInterval = setInterval(async () => {
      try {
        const updatedJob = await compileQueue.getJob(job.id);
        if (!updatedJob) { clearInterval(pollInterval); return; }
        const data = updatedJob.data;
        if (data._progress) {
          io.to(`job:${job.id}`).emit('compile:progress', {
            jobId: job.id,
            ...data._progress,
            lastLine: data._lastLine,
          });
        }
        const state = await updatedJob.getState();
        if (['completed', 'failed'].includes(state)) clearInterval(pollInterval);
      } catch (e) {
        clearInterval(pollInterval);
      }
    }, 500);

    res.json({ jobId: job.id, status: 'queued', message: 'Compilation job queued' });

  } catch (err) {
    logger.error('Failed to queue job:', err);
    res.status(500).json({ error: 'Failed to queue compilation job', message: err.message });
  }
});

// GET /api/compile/:jobId — poll job status (fallback if no socket)
router.get('/:jobId', async (req, res) => {
  const compileQueue = req.app.get('compileQueue');
  try {
    const job = await compileQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const state = await job.getState();
    const progress = job.data._progress || {};
    const lastLine = job.data._lastLine || '';

    if (state === 'completed') {
      const result = await job.finished();
      return res.json({ jobId: job.id, status: 'completed', result });
    }

    if (state === 'failed') {
      return res.json({
        jobId: job.id, status: 'failed',
        error: job.failedReason || 'Compilation failed',
        errors: [{ file: 'sketch.ino', line: 1, col: 1, severity: 'error', message: job.failedReason }]
      });
    }

    res.json({ jobId: job.id, status: state, progress, lastLine });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
