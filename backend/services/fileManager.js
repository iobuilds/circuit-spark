const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

module.exports = {
  async createWorkspace(jobId) {
    const workDir = path.join(config.TEMP_DIR, String(jobId));
    const sketchDir = path.join(workDir, 'sketch');
    const outputDir = path.join(workDir, 'output');
    await fs.mkdir(sketchDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    return workDir;
  },

  async writeFiles(workDir, files) {
    const sketchDir = path.join(workDir, 'sketch');
    for (const file of files) {
      const safeName = path.basename(file.name);
      await fs.writeFile(path.join(sketchDir, safeName), file.content, 'utf8');
    }
  },

  async readBinary(outputDir) {
    const files = await fs.readdir(outputDir);
    for (const ext of ['.hex', '.bin', '.uf2']) {
      const match = files.find(f => f.endsWith(ext));
      if (match) {
        const filePath = path.join(outputDir, match);
        const content = await fs.readFile(filePath);
        const stats = await fs.stat(filePath);
        return { binary: content.toString('base64'), binaryType: ext.slice(1), binarySize: stats.size };
      }
    }
    return { binary: null, binaryType: null, binarySize: 0 };
  },

  async cleanup(workDir, delayMs = 0) {
    const doDelete = async () => {
      try {
        await fs.rm(workDir, { recursive: true, force: true });
      } catch (e) {
        logger.warn(`Cleanup failed for ${workDir}: ${e.message}`);
      }
    };
    if (delayMs > 0) {
      setTimeout(doDelete, delayMs);
    } else {
      await doDelete();
    }
  },

  async ensureTempDir() {
    await fs.mkdir(config.TEMP_DIR, { recursive: true });
  }
};
