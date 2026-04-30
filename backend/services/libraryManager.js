const { spawn } = require('child_process');
const config = require('../config');
const logger = require('../utils/logger');
const fs = require('fs');

module.exports = {
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
    return new Promise((resolve, reject) => {
      const libStr = version ? `${name}@${version}` : name;
      logger.info(`Installing library: ${libStr}`);
      const proc = spawn(config.ARDUINO_CLI_PATH, ['lib', 'install', libStr]);
      let err = '';
      proc.stderr.on('data', d => err += d);
      proc.on('close', (code) => {
        if (code === 0) resolve({ success: true, name, version });
        else reject(new Error(err || `Failed to install ${libStr}`));
      });
      proc.on('error', reject);
    });
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
