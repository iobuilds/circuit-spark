const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

let client = null;

function getClient() {
  if (!client) {
    client = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on('error', (err) => logger.warn('Redis error:', err.message));
    client.on('connect', () => logger.info('Redis connected'));
  }
  return client;
}

module.exports = {
  async get(key) {
    try {
      const data = await getClient().get(`compile:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      logger.warn('Cache get error:', e.message);
      return null;
    }
  },

  async set(key, value, ttlSeconds) {
    try {
      await getClient().setex(`compile:${key}`, ttlSeconds, JSON.stringify(value));
    } catch (e) {
      logger.warn('Cache set error:', e.message);
    }
  },

  async del(key) {
    try {
      await getClient().del(`compile:${key}`);
    } catch (e) {
      logger.warn('Cache del error:', e.message);
    }
  },

  async flush() {
    try {
      const keys = await getClient().keys('compile:*');
      if (keys.length > 0) await getClient().del(...keys);
      return keys.length;
    } catch (e) {
      logger.warn('Cache flush error:', e.message);
      return 0;
    }
  }
};
