const express = require('express');
const router = express.Router();
const { compileQueue } = require('../queue/compileQueue');
const { execSync, spawn } = require('child_process');
const config = require('../config');

const BACKEND_BUILD_MARKER = 'lib-drift-fallback-2026-05-04';

function normalizeCliLibraryList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.installed_libraries)) return parsed.installed_libraries;
  if (Array.isArray(parsed?.libraries)) return parsed.libraries;
  return [];
}

function runCli(args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const proc = spawn(config.ARDUINO_CLI_PATH, args, { env: { ...process.env, HOME: process.env.HOME || '/root' } });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, timeoutMs);
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
    proc.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout: '', stderr: e.message }); });
  });
}

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
      buildMarker: BACKEND_BUILD_MARKER,
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.get('/libraries', async (req, res) => {
  const names = String(req.query.names || 'U8g2,Adafruit GFX Library,Adafruit SSD1306')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const result = await runCli(['lib', 'list', '--format', 'json']);
  let libraries = [];
  let parseError = null;
  try {
    libraries = normalizeCliLibraryList(JSON.parse(result.stdout || '[]'));
  } catch (e) {
    parseError = e.message;
  }
  const installedNames = libraries.map((l) => l.library?.name).filter(Boolean);
  const lower = new Set(installedNames.map((name) => name.toLowerCase()));
  res.json({
    status: parseError ? 'parse_error' : 'ok',
    buildMarker: BACKEND_BUILD_MARKER,
    cliExitCode: result.code,
    stderr: result.stderr.trim(),
    checked: names.map((name) => ({ name, visible: lower.has(name.toLowerCase()) })),
    installedNames,
  });
});

module.exports = router;
