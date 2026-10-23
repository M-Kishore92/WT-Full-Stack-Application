import { redis } from "../config/redis";
import { config } from "../config";

export class CacheService {
  static async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err) {
      console.warn(`[Cache GET Warning for ${key}]:`, err);
      return null;
    }
  }

  static async set(key: string, value: any, ttlSeconds: number = config.cacheTTL): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      console.warn(`[Cache SET Warning for ${key}]:`, err);
    }
  }

  static async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (err) {
      console.warn(`[Cache DEL Warning for ${key}]:`, err);
    }
  }

  static async invalidateEvent(eventId?: string): Promise<void> {
    try {
      const pipeline = redis.pipeline();
      pipeline.del("cache:events:public");
      if (eventId) {
        pipeline.del(`cache:event:${eventId}`);
      }
      await pipeline.exec();
    } catch (err) {
      console.warn("[Cache Invalidation Warning]:", err);
    }
  }
}
