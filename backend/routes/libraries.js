const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const libraryManager = require('../services/libraryManager');

const upload = multer({
  dest: '/tmp/embedsim-uploads/',
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.zip') {
      return cb(new Error('Only .zip files allowed'));
    }
    cb(null, true);
  }
});

router.get('/', async (req, res) => {
  try { res.json(await libraryManager.list()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/search', async (req, res) => {
  try { res.json(await libraryManager.search(req.query.q || '', req.query.topic)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/install', async (req, res) => {
  const { name, version } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try { res.json(await libraryManager.install(name, version)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Install many libraries in one request. Body: { names: string[] }
// Returns { success, results: [{ name, ok, error? }] }.
router.post('/install-batch', async (req, res) => {
  const { names } = req.body || {};
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'names[] required' });
  }
  if (names.length > 25) return res.status(400).json({ error: 'too many libraries (max 25)' });
  try {
    const result = await libraryManager.installBatch(names);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Streaming variant — emits one Server-Sent-Event per progress step so the UI
// can show a live install log. Body: { names: string[] }.
router.post('/install-batch/stream', async (req, res) => {
  const { names } = req.body || {};
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'names[] required' });
  }
  if (names.length > 25) return res.status(400).json({ error: 'too many libraries (max 25)' });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const result = await libraryManager.installBatch(names, send);
    send({ type: 'result', ...result });
  } catch (e) {
    send({ type: 'fatal', error: e.message });
  } finally {
    res.end();
  }
});

// Force a re-fetch of arduino-cli core/library indexes. Useful when the VPS
// environment has a stale or corrupted index file.
router.post('/repair', async (_req, res) => {
  try { res.json(await libraryManager.repair()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/upload', upload.single('zipfile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No zip file uploaded' });
  try { res.json(await libraryManager.installFromZip(req.file.path)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:name', async (req, res) => {
  try { res.json(await libraryManager.uninstall(req.params.name)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
