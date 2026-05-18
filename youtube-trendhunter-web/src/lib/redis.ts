import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const DEFAULT_TTL = 600 // 10 minutes

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get<T>(key)
    return data ?? null
  } catch {
    return null
  }
}

export async function setCached<T>(key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> {
  try {
    await redis.set(key, data, { ex: ttl })
  } catch {
    // Cache is best-effort, swallow errors
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } catch {
    // Best-effort
  }
}

// Debounce lock: prevent concurrent processing of the same niche
export async function acquireLock(key: string, ttlSeconds: number = 300): Promise<boolean> {
  try {
    const result = await redis.set(`lock:${key}`, "1", { ex: ttlSeconds, nx: true })
    return result === "OK"
  } catch {
    return false
  }
}

export async function releaseLock(key: string): Promise<void> {
  try {
    await redis.del(`lock:${key}`)
  } catch {
    // Best-effort
  }
}

export default redis
