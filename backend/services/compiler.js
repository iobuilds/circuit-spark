const { spawn } = require('child_process');
const path = require('path');
const boardsConfig = require('../config/boards');
const fileManager = require('./fileManager');
const errorParser = require('../utils/errorParser');
const logger = require('../utils/logger');
const config = require('../config');

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
    return new Promise((resolve) => {
      const proc = spawn(config.ARDUINO_CLI_PATH, ['lib', 'list', '--format', 'json']);
      let out = '';
      proc.stdout.on('data', d => out += d);
      proc.on('close', () => {
        try {
          const installed = JSON.parse(out || '[]');
          const installedNames = installed.map(l => l.library?.name?.toLowerCase());
          const missing = libraries.filter(l => !installedNames.includes(l.toLowerCase()));
          resolve(missing);
        } catch (e) {
          resolve([]);
        }
      });
      proc.on('error', () => resolve([]));
    });
  }

  async installLibraries(libraries) {
    for (const lib of libraries) {
      await new Promise((resolve) => {
        logger.info(`Installing library: ${lib}`);
        const proc = spawn(config.ARDUINO_CLI_PATH, ['lib', 'install', lib]);
        proc.on('close', resolve);
        proc.on('error', resolve);
      });
    }
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
