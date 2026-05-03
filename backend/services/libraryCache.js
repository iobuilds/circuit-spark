// Caches the set of installed Arduino libraries in Redis so we don't shell out
// to `arduino-cli lib list` on every compile, and don't re-run `lib install`
// for libs we already installed in a previous job.
//
// The cache key is salted with an "index version" derived from the mtime of
// arduino-cli's library_index.json. When the index is refreshed (new package
// list / new versions available), the version changes and the cache is
// implicitly invalidated — exactly what the user asked for.

const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const INDEX_FILES = [
  // Standard arduino-cli index locations. We hash mtimes of whichever exist.
  path.join(process.env.HOME || '/root', '.arduino15', 'library_index.json'),
  path.join(process.env.HOME || '/root', '.arduino15', 'package_index.json'),
];

let client = null;
function getClient() {
  if (!client) {
    client = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on('error', (err) => logger.warn('Redis (libcache) error:', err.message));
  }
  return client;
}

/**
 * Returns a short string that changes whenever arduino-cli's local index files
 * change. Used to salt the cache key so a `lib update-index` invalidates it.
 */
function getIndexVersion() {
  const parts = [];
  for (const f of INDEX_FILES) {
    try {
      const st = fs.statSync(f);
      parts.push(`${path.basename(f)}:${st.mtimeMs}:${st.size}`);
    } catch (_) {
      parts.push(`${path.basename(f)}:none`);
    }
  }
  return Buffer.from(parts.join('|')).toString('base64').slice(0, 24);
}

function keyFor(version) {
  return `libcache:installed:${version}`;
}

module.exports = {
  getIndexVersion,

  /**
   * @returns {Promise<Set<string> | null>} lowercase library names known to be
   *   installed for the current index version, or null if no cache entry yet.
   */
  async getInstalledSet() {
    try {
      const v = getIndexVersion();
      const members = await getClient().smembers(keyFor(v));
      if (!members || members.length === 0) return null;
      return new Set(members.map(m => m.toLowerCase()));
    } catch (e) {
      logger.warn('libcache get error:', e.message);
      return null;
    }
  },

  /**
   * Replace the cached installed set for the current index version.
   */
  async setInstalledSet(libNames) {
    try {
      const v = getIndexVersion();
      const k = keyFor(v);
      const c = getClient();
      const pipe = c.multi();
      pipe.del(k);
      if (libNames.length > 0) pipe.sadd(k, ...libNames.map(n => n.toLowerCase()));
      pipe.expire(k, TTL_SECONDS);
      await pipe.exec();
    } catch (e) {
      logger.warn('libcache set error:', e.message);
    }
  },

  /**
   * Mark one library as installed (called after a successful `lib install`).
   */
  async markInstalled(libName) {
    try {
      const v = getIndexVersion();
      const k = keyFor(v);
      const c = getClient();
      await c.sadd(k, libName.toLowerCase());
      await c.expire(k, TTL_SECONDS);
    } catch (e) {
      logger.warn('libcache mark error:', e.message);
    }
  },

  /**
   * Drop the cache for the current version (called when something looks wrong,
   * e.g. an install fails with "already installed" / drift detected).
   */
  async invalidate() {
    try {
      const v = getIndexVersion();
      await getClient().del(keyFor(v));
    } catch (e) {
      logger.warn('libcache invalidate error:', e.message);
    }
  },
};
