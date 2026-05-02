/**
 * In-memory TTL cache đơn giản (Map-based).
 * Mỗi namespace là 1 instance riêng để invalidate theo domain.
 *
 * @example
 *   const supplierCache = createCache({ ttl: 10 * 60_000 }); // 10 phút
 *   const data = await supplierCache.getOrSet("all", () => db("supplier").select("*"));
 *   supplierCache.clear();                                    // invalidate
 */

const logger = require("./logger");

function createCache({ ttl = 5 * 60_000, maxKeys = 200, name = "cache" } = {}) {
  const store = new Map();

  const isExpired = (entry) => Date.now() - entry.ts > ttl;

  const evictIfNeeded = () => {
    if (store.size <= maxKeys) return;
    const oldest = store.keys().next().value;
    store.delete(oldest);
  };

  /** Lấy cached value hoặc gọi fetcher rồi lưu. */
  const getOrSet = async (key, fetcher) => {
    const cached = store.get(key);
    if (cached && !isExpired(cached)) {
      return cached.value;
    }

    const value = await fetcher();
    evictIfNeeded();
    store.set(key, { value, ts: Date.now() });
    return value;
  };

  /** Xóa 1 key hoặc toàn bộ cache. */
  const clear = (key) => {
    if (key !== undefined) {
      store.delete(key);
    } else {
      store.clear();
      logger.debug(`[Cache:${name}] cleared`);
    }
  };

  const size = () => store.size;

  return { getOrSet, clear, size };
}

const supplierCache = createCache({ ttl: 10 * 60_000, name: "supplier" });
const bankCache     = createCache({ ttl: 30 * 60_000, name: "bank" });
const pricingCache  = createCache({ ttl: 5 * 60_000,  name: "pricing" });

module.exports = {
  createCache,
  supplierCache,
  bankCache,
  pricingCache,
};
