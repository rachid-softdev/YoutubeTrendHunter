import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const DEFAULT_TTL = 600; // 10 minutes

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get<T>(key);
    return data ?? null;
  } catch (error) {
    console.warn(`[Redis] getCached failed for key "${key}":`, error);
    return null;
  }
}

export async function setCached<T>(key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> {
  try {
    await redis.set(key, data, { ex: ttl });
  } catch (error) {
    console.warn(`[Redis] setCached failed for key "${key}":`, error);
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys: string[] = [];
    let cursor: number | string = 0;
    do {
      const result = await redis.scan(cursor, { match: pattern, count: 100 });
      cursor = result[0];
      keys.push(...(result[1] as string[]));
    } while (Number(cursor) !== 0);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.warn(`[Redis] Cache invalidation failed for pattern "${pattern}":`, error);
  }
}

// Debounce lock: prevent concurrent processing of the same niche
export async function acquireLock(key: string, ttlSeconds: number = 300): Promise<boolean> {
  try {
    const result = await redis.set(`lock:${key}`, "1", { ex: ttlSeconds, nx: true });
    return result === "OK";
  } catch (error) {
    console.warn(`[Redis] acquireLock failed for key "${key}":`, error);
    return false;
  }
}

export async function releaseLock(key: string): Promise<void> {
  try {
    await redis.del(`lock:${key}`);
  } catch (error) {
    console.warn(`[Redis] releaseLock failed for key "${key}":`, error);
  }
}

export default redis;
