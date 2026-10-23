import Redis from "ioredis";
import { config } from "./index";

// General-purpose Redis client (cache, etc.)
// maxRetriesPerRequest: 3 so calls fail fast instead of retrying forever
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 5) return null; // Stop retrying after 5 attempts
    return Math.min(times * 100, 2000);
  },
});

// Dedicated BullMQ Redis client — must have maxRetriesPerRequest: null
export const bullRedis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    return Math.min(times * 100, 3000);
  },
});

redis.on("error", (err) => {
  if (process.env.NODE_ENV !== "test") {
    console.error("[Redis Error]:", err.message);
  }
});

redis.on("connect", () => {
  if (process.env.NODE_ENV !== "test") {
    console.log("[Redis] Connected successfully");
  }
});

bullRedis.on("error", (err) => {
  if (process.env.NODE_ENV !== "test") {
    console.error("[BullMQ Redis Error]:", err.message);
  }
});
