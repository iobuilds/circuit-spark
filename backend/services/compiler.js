const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const boardsConfig = require('../config/boards');
const fileManager = require('./fileManager');
const errorParser = require('../utils/errorParser');
const logger = require('../utils/logger');
const config = require('../config');
const libraryCache = require('./libraryCache');

function baseLibraryName(name) {
  return String(name || '').split('@')[0].trim();
}

function isRecoverableCliIssue(text) {
  const blob = String(text || '').toLowerCase();
  return blob.includes('index') ||
    blob.includes('not found') ||
    blob.includes('no such file') ||
    blob.includes('temporary') ||
    blob.includes('timeout') ||
    blob.includes('network') ||
    blob.includes('initializing instance');
}

class CompilerService {
  parseMemoryStats(output, boardKey) {
    const board = boardsConfig[boardKey] || {};
    const result = {
      flashUsed: 0, flashTotal: board.flashTotal || 0, flashPercent: 0,
      ramUsed: 0, ramTotal: board.ramTotal || 0, ramPercent: 0,
    };

    const flashMatch = output.match(/Sketch uses (\d+) bytes \((\d+)%\) of program storage/);
    if (flashMatch) {
      result.flashUsed = parseInt(flashMatch[1]);
      result.flashPercent = parseInt(flashMatch[2]);
    }

    const ramMatch = output.match(/Global variables use (\d+) bytes \((\d+)%\) of dynamic memory/);
    if (ramMatch) {
      result.ramUsed = parseInt(ramMatch[1]);
      result.ramPercent = parseInt(ramMatch[2]);
    }

    return result;
  }

  async checkLibraries(libraries) {
    if (!libraries || libraries.length === 0) return [];

    // Fast path: Redis-backed cache of the installed set, salted by the
    // arduino-cli index version. Skips spawning `lib list` (~300-800ms) every
    // compile and skips re-installing libs we know are already there.
    const cached = await libraryCache.getInstalledSet();
    if (cached) {
      const missing = libraries.filter(l => !cached.has(baseLibraryName(l).toLowerCase()));
      logger.info(`libcache hit (v=${libraryCache.getIndexVersion()}): ${libraries.length - missing.length}/${libraries.length} already installed`);
      return missing;
    }

    // Slow path: ask arduino-cli, then warm the cache.
    return new Promise((resolve) => {
      const proc = spawn(config.ARDUINO_CLI_PATH, ['lib', 'list', '--format', 'json'], {
        env: { ...process.env, HOME: '/root' },
      });
      let out = '';
      proc.stdout.on('data', d => out += d);
      proc.on('close', async () => {
        try {
          const installed = JSON.parse(out || '[]');
          const installedNames = installed
            .map(l => l.library?.name)
            .filter(Boolean);
          await libraryCache.setInstalledSet(installedNames);
          const lower = new Set(installedNames.map(n => n.toLowerCase()));
          const missing = libraries.filter(l => !lower.has(baseLibraryName(l).toLowerCase()));
          resolve(missing);
        } catch (e) {
          resolve(libraries); // assume missing on parse error
        }
      });
      proc.on('error', () => resolve(libraries));
    });
  }

  // Run a CLI command and capture exit code + output. Resolves (never rejects).
  _run(args, { timeoutMs = 120000 } = {}) {
    return new Promise((resolve) => {
      const proc = spawn(config.ARDUINO_CLI_PATH, args, {
        env: { ...process.env, HOME: '/root' },
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, timeoutMs);
      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
      proc.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout: '', stderr: e.message }); });
    });
  }

  // Drift check: confirm a library actually shows up in `arduino-cli lib list`
  // after a reportedly successful install. Matches by name (case-insensitive).
  async _verifyLibraryInstalled(libName) {
    const target = String(libName).split('@')[0].trim().toLowerCase();
    const res = await this._run(['lib', 'list', '--format', 'json'], { timeoutMs: 30000 });
    if (res.code !== 0) {
      logger.warn(`verify lib list failed (${res.code}): ${res.stderr.trim()}`);
      return false;
    }
    try {
      const arr = JSON.parse(res.stdout || '[]');
      return arr.some(l => (l.library?.name || '').toLowerCase() === target);
    } catch (e) {
      logger.warn(`verify lib list parse error: ${e.message}`);
      return false;
    }
  }

  // Self-healing index refresh. arduino-cli sometimes returns non-zero when an
  // optional 3rd-party index (e.g. rp2040) is unreachable. We log it but never
  // treat it as fatal — the official lib index is what matters for `lib install`.
  async updateIndex() {
    logger.info('Refreshing arduino-cli indexes...');
    const core = await this._run(['core', 'update-index']);
    if (core.code !== 0) logger.warn(`core update-index: ${core.stderr.trim() || core.stdout.trim()}`);
    const lib = await this._run(['lib', 'update-index']);
    if (lib.code !== 0) logger.warn(`lib update-index: ${lib.stderr.trim() || lib.stdout.trim()}`);
  }

  async installLibraries(libraries) {
    if (!libraries || libraries.length === 0) return;

    const tryInstall = (lib) => this._run(['lib', 'install', lib], { timeoutMs: 180000 });
    const failed = [];

    for (const lib of libraries) {
      logger.info(`Installing library: ${lib}`);
      let result = await tryInstall(lib);

      // Retry once after a fresh index refresh — covers stale/missing index
      // files (the rp2040 warning the user is seeing) and transient network blips.
      if (result.code !== 0) {
        const errText = result.stderr + result.stdout;
        if (isRecoverableCliIssue(errText)) {
          logger.warn(`Install of ${lib} failed (${result.code}); refreshing index and retrying...`);
          await this.repairCliIndexes();
          result = await tryInstall(lib);
        }
      }

      if (result.code !== 0) {
        const msg = (result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`);
        logger.error(`Failed to install ${lib}: ${msg}`);
        failed.push({ lib, error: msg });
      } else {
        // Drift detection: arduino-cli sometimes reports success but the lib
        // isn't actually resolvable (corrupted index, partial download, perms).
        // Verify by asking `lib list` and confirming it shows up. If not,
        // invalidate the cache so we don't poison future compiles, and fail loud.
        const verified = await this._verifyLibraryInstalled(lib);
        if (!verified) {
          logger.error(`Drift detected: ${lib} reported installed but not visible to arduino-cli`);
          await this.repairCliIndexes();
          result = await tryInstall(lib);
          const verifiedAfterRepair = result.code === 0 && await this._verifyLibraryInstalled(lib);
          if (!verifiedAfterRepair) {
            failed.push({ lib, error: `install reported success but library not found by arduino-cli after automatic index repair` });
          } else {
            logger.info(`Installed library after index repair: ${lib} (verified)`);
            await libraryCache.markInstalled(baseLibraryName(lib));
          }
        } else {
          logger.info(`Installed library: ${lib} (verified)`);
          await libraryCache.markInstalled(baseLibraryName(lib));
        }
      }
    }

    if (failed.length > 0) {
      const msg = failed.map(f => `${f.lib}: ${f.error}`).join('; ');
      throw new Error(`Library install failed — ${msg}`);
    }
  }

  async repairCliIndexes() {
    const arduinoHome = path.join(process.env.HOME || '/root', '.arduino15');
    const staleIndexes = ['package_rp2040_index.json', 'package_rp2040_index.json.sig'];
    for (const file of staleIndexes) {
      try { await fs.rm(path.join(arduinoHome, file), { force: true }); } catch (_) {}
    }
    await libraryCache.invalidate();
    await this.updateIndex();
  }

  async compile({ workDir, board, jobId, onOutput }) {
    const boardInfo = boardsConfig[board];
    if (!boardInfo) throw new Error(`Unknown board: ${board}`);

    const sketchDir = path.join(workDir, 'sketch');
    const outputDir = path.join(workDir, 'output');

    const args = [
      'compile',
      '--fqbn', boardInfo.fqbn,
      '--output-dir', outputDir,
      '--format', 'json',
      '--warnings', 'all',
      sketchDir
    ];

    logger.info(`Compiling job ${jobId} for ${boardInfo.name}: arduino-cli ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn(config.ARDUINO_CLI_PATH, args, {
        env: { ...process.env, HOME: '/root' },
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
        reject(new Error(`Compilation timed out after ${config.COMPILE_TIMEOUT_MS / 1000}s`));
      }, config.COMPILE_TIMEOUT_MS);

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
        if (onOutput) onOutput(d.toString().trim());
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
        if (onOutput) onOutput(d.toString().trim());
      });

      proc.on('close', async (code) => {
        clearTimeout(timer);
        if (killed) return;

        try {
          let cliJson = {};
          try {
            const lines = stdout.trim().split('\n').filter(Boolean);
            for (let i = lines.length - 1; i >= 0; i--) {
              try { cliJson = JSON.parse(lines[i]); break; } catch (e) { continue; }
            }
          } catch (e) {}

          const compilerErr = cliJson.compiler_err || stderr || '';
          const compilerOut = cliJson.compiler_out || stdout || '';

          if (code !== 0) {
            return resolve({
              success: false,
              errors: errorParser.parse(compilerErr),
              warnings: errorParser.parseWarnings(compilerOut),
              stdout: compilerOut,
              stderr: compilerErr,
            });
          }

          const { binary, binaryType, binarySize } = await fileManager.readBinary(outputDir);
          const memStats = this.parseMemoryStats(compilerOut, board);

          resolve({
            success: true,
            stdout: compilerOut,
            stderr: '',
            errors: [],
            warnings: errorParser.parseWarnings(compilerOut),
            binary,
            binaryType,
            binarySize,
            ...memStats,
          });
        } catch (e) {
          reject(e);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

module.exports = new CompilerService();
