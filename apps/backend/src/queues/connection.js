const { redisClient, isRedisAvailable } = require("../config/redisClient");

/**
 * BullMQ requires an ioredis instance with maxRetriesPerRequest: null.
 * We reuse the same client from redisClient.js which already sets this.
 */
const getQueueConnection = () => {
  if (!isRedisAvailable()) return null;
  return redisClient;
};

module.exports = { getQueueConnection };
