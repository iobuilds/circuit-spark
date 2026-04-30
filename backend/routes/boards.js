const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const boardsConfig = require('../config/boards');
const config = require('../config');

router.get('/', (req, res) => {
  res.json(Object.entries(boardsConfig).map(([id, b]) => ({ id, ...b })));
});

router.post('/install', async (req, res) => {
  const { package: pkg } = req.body;
  if (!pkg) return res.status(400).json({ error: 'package required' });
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(config.ARDUINO_CLI_PATH, ['core', 'install', pkg]);
      let err = '';
      proc.stderr.on('data', d => err += d);
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(err)));
      proc.on('error', reject);
    });
    res.json({ success: true, message: `${pkg} installed` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/installed', async (req, res) => {
  try {
    await new Promise((resolve) => {
      const proc = spawn(config.ARDUINO_CLI_PATH, ['core', 'list', '--format', 'json']);
      let out = '';
      proc.stdout.on('data', d => out += d);
      proc.on('close', () => { try { res.json(JSON.parse(out)); resolve(); } catch(e) { res.json([]); resolve(); } });
      proc.on('error', () => { res.json([]); resolve(); });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
