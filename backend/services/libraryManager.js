const { spawn } = require('child_process');
const config = require('../config');
const logger = require('../utils/logger');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const libraryCache = require('./libraryCache');

function baseLibraryName(name) {
  return String(name || '').split('@')[0].trim();
}

function isRecoverableCliIssue(text) {
  const blob = String(text || '').toLowerCase();
  return blob.includes('index') || blob.includes('no such file') || blob.includes('not found') || blob.includes('initializing instance');
}

function runCli(args, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const proc = spawn(config.ARDUINO_CLI_PATH, args, { env: { ...process.env, HOME: process.env.HOME || '/root' } });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, timeoutMs);
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
    proc.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout: '', stderr: e.message }); });
  });
}

async function repairCliIndexes() {
  const arduinoHome = path.join(process.env.HOME || '/root', '.arduino15');
  for (const file of ['package_rp2040_index.json', 'package_rp2040_index.json.sig']) {
    try { await fsp.rm(path.join(arduinoHome, file), { force: true }); } catch (_) {}
  }
  await libraryCache.invalidate();
  await runCli(['core', 'update-index']);
  await runCli(['lib', 'update-index']);
}

// Public wrapper so routes can trigger the index repair.
async function repair() {
  await repairCliIndexes();
  return { success: true };
}

module.exports = {
  repair,

  async search(query, topic) {
    return new Promise((resolve) => {
      const args = ['lib', 'search', query, '--format', 'json'];
      const proc = spawn(config.ARDUINO_CLI_PATH, args);
      let out = '';
      proc.stdout.on('data', d => out += d);
      proc.on('close', () => {
        try {
          const result = JSON.parse(out);
          let libraries = result.libraries || [];
          if (topic) libraries = libraries.filter(l => l.category?.toLowerCase().includes(topic.toLowerCase()));
          resolve(libraries.slice(0, 50));
        } catch (e) {
          resolve([]);
        }
      });
      proc.on('error', () => resolve([]));
    });
  },

  async list() {
    return new Promise((resolve) => {
      const proc = spawn(config.ARDUINO_CLI_PATH, ['lib', 'list', '--format', 'json']);
      let out = '';
      proc.stdout.on('data', d => out += d);
      proc.on('close', () => {
        try { resolve(JSON.parse(out) || []); } catch (e) { resolve([]); }
      });
      proc.on('error', () => resolve([]));
    });
  },

  async install(name, version) {
    const libStr = version ? `${name}@${version}` : name;
    logger.info(`Installing library: ${libStr}`);

    // Run `lib install` and capture stdout+stderr so we can surface the real
    // failure reason. arduino-cli sometimes exits 0 even when nothing was
    // actually installed (e.g. when its instance init failed because of a
    // broken 3rd-party index like the rp2040 one). We defend against that
    // by re-listing libraries afterwards and confirming the new one shows up.
    const runOnce = () => runCli(['lib', 'install', libStr]);

    let r = await runOnce();
    // If the failure mentions index problems, refresh and retry once.
    const errBlob = r.stdout + r.stderr;
    if (r.code !== 0 && isRecoverableCliIssue(errBlob)) {
      logger.warn(`Install of ${libStr} failed; refreshing index and retrying`);
      await repairCliIndexes();
      r = await runOnce();
    }
    if (r.code !== 0) {
      throw new Error((r.stderr || r.stdout || `exit ${r.code}`).trim());
    }

    // Drift check: confirm arduino-cli can actually see the library now.
    const installed = await this.list();
    const target = String(name).toLowerCase();
    const hit = (installed || []).some(l => (l.library?.name || '').toLowerCase() === target);
    if (!hit) {
      logger.warn(`arduino-cli install drift for ${name}; repairing indexes and retrying`);
      await repairCliIndexes();
      r = await runOnce();
      if (r.code !== 0) throw new Error((r.stderr || r.stdout || `exit ${r.code}`).trim());
      const afterRepair = await this.list();
      const fixed = (afterRepair || []).some(l => (l.library?.name || '').toLowerCase() === target);
      if (!fixed) throw new Error(`arduino-cli reported success but '${name}' is still not visible after automatic index repair.`);
    }

    await libraryCache.markInstalled(baseLibraryName(name));
    return { success: true, name, version };
  },

  async installFromZip(zipPath) {
    return new Promise((resolve, reject) => {
      logger.info(`Installing library from zip: ${zipPath}`);
      const proc = spawn(config.ARDUINO_CLI_PATH, ['lib', 'install', '--zip-path', zipPath]);
      let err = '';
      proc.stderr.on('data', d => err += d);
      proc.on('close', (code) => {
        try { fs.unlinkSync(zipPath); } catch(e) {}
        if (code === 0) resolve({ success: true, message: 'Library installed from ZIP' });
        else reject(new Error(err || 'ZIP install failed'));
      });
      proc.on('error', reject);
    });
  },

  async uninstall(name) {
    return new Promise((resolve, reject) => {
      const proc = spawn(config.ARDUINO_CLI_PATH, ['lib', 'uninstall', name]);
      proc.on('close', (code) => {
        if (code === 0) resolve({ success: true });
        else reject(new Error(`Failed to uninstall ${name}`));
      });
      proc.on('error', reject);
    });
  }
};
