require('dotenv').config();
const { compileQueue } = require('./compileQueue');
const compiler = require('../services/compiler');
const cache = require('../services/cache');
const fileManager = require('../services/fileManager');
const hashCode = require('../utils/hashCode');
const logger = require('../utils/logger');
const config = require('../config');
const { validatePins } = require('../utils/pinValidator');
const {
  detectRequiredLibraries,
  resolveLibraryNames,
  resolveHeadersToLibraries,
  missingHeadersFromCompilerOutput,
} = require('../utils/includeScanner');

fileManager.ensureTempDir();

compileQueue.process(config.MAX_CONCURRENT_JOBS, async (job) => {
  const { files, board, libraries } = job.data;
  const startTime = Date.now();

  const emit = async (step, percent, message) => {
    await job.progress(percent);
    await job.update({ ...job.data, _progress: { step, percent, message, ts: Date.now() } });
    logger.info(`Job ${job.id} [${percent}%] ${message}`);
  };

  try {
    // Static pin-range validation runs BEFORE the cache check so cached
    // "success" results from before this validator existed (or for code that
    // arduino-cli happily compiles like digitalWrite(60, ...)) cannot bypass
    // the check.
    const pinErrors = validatePins(files, board);
    if (pinErrors.length > 0) {
      await emit('validate', 100, `Invalid pin reference (${pinErrors.length}) ✗`);
      return {
        success: false,
        stdout: '',
        stderr: pinErrors.map(e => `${e.file}:${e.line}:${e.col}: error: ${e.message}`).join('\n'),
        errors: pinErrors,
        warnings: [],
        binary: null,
        binaryType: null,
        binarySize: 0,
        flashUsed: 0, flashTotal: 0, flashPercent: 0,
        ramUsed: 0,   ramTotal: 0,   ramPercent: 0,
        duration: Date.now() - startTime,
        fromCache: false,
      };
    }

    await emit('cache_check', 5, 'Checking cache...');
    const cacheKey = hashCode.generate({ files, board, libraries });

    if (config.CACHE_ENABLED) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        await emit('cache_hit', 100, 'Loaded from cache ⚡');
        return { ...cached, fromCache: true, duration: Date.now() - startTime };
      }
    }

    await emit('prepare', 15, 'Preparing workspace...');
    const workDir = await fileManager.createWorkspace(job.id);

    try {
      await emit('write', 25, 'Writing source files...');
      await fileManager.writeFiles(workDir, files);

      await emit('libraries', 40, 'Checking libraries...');
      const detected = detectRequiredLibraries(files);
      let allLibs = resolveLibraryNames(Array.from(new Set([...(libraries || []), ...detected])));
      const missing = await compiler.checkLibraries(allLibs);
      if (missing.length > 0) {
        await emit('install_libs', 50, `Installing ${missing.length} missing libraries: ${missing.join(', ')}`);
        try {
          await compiler.installLibraries(missing);
        } catch (installErr) {
          await emit('install_libs', 100, `Library install failed ✗`);
          return {
            success: false, stdout: '', stderr: installErr.message,
            errors: [{ file: 'libraries', line: 0, col: 0, message: installErr.message, severity: 'error' }],
            warnings: [], binary: null, binaryType: null, binarySize: 0,
            flashUsed: 0, flashTotal: 0, flashPercent: 0,
            ramUsed: 0, ramTotal: 0, ramPercent: 0,
            duration: Date.now() - startTime, fromCache: false,
          };
        }
      }

      const runCompile = () => compiler.compile({
        workDir, board, jobId: job.id,
        onOutput: async (line) => {
          if (line.trim()) {
            await job.update({ ...job.data, _lastLine: line.substring(0, 200) });
          }
        }
      });

      await emit('compile', 65, 'Compiling with arduino-cli...');
      let result = await runCompile();

      const missingHeaders = missingHeadersFromCompilerOutput(`${result.stderr}\n${result.stdout}\n${JSON.stringify(result.errors || [])}`);
      const retryLibs = resolveLibraryNames(resolveHeadersToLibraries(missingHeaders))
        .filter(lib => !allLibs.some(existing => existing.split('@')[0].toLowerCase() === lib.split('@')[0].toLowerCase()));
      if (!result.success && retryLibs.length > 0) {
        await emit('install_libs', 75, `Auto-installing libraries for missing headers: ${retryLibs.join(', ')}`);
        await compiler.installLibraries(retryLibs);
        allLibs = [...allLibs, ...retryLibs];
        await emit('compile', 85, 'Retrying compile with auto-installed libraries...');
        result = await runCompile();
      }

      await emit('finish', 100, result.success ? 'Compilation successful ✓' : 'Compilation failed ✗');

      const final = { ...result, duration: Date.now() - startTime, fromCache: false };

      if (result.success && config.CACHE_ENABLED) {
        await cache.set(cacheKey, final, config.CACHE_TTL_SECONDS);
      }

      return final;

    } finally {
      fileManager.cleanup(workDir, config.CLEANUP_AFTER_MS);
    }

  } catch (err) {
    logger.error(`Worker error job ${job.id}: ${err.message}`);
    throw err;
  }
});

logger.info(`Worker ready (concurrency: ${config.MAX_CONCURRENT_JOBS})`);
