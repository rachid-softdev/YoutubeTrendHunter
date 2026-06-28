// ============================================
// Two-Level Cache: Redis (L1) + Memory LRU (L2)
// ============================================

import type { ICacheService } from "./types";

const WARN_MISSING_REDIS = "[FeatureFlags] Redis not configured — using memory-only cache. Staleness up to 30s accepted.";

// ─── Memory LRU Cache ───

interface LRUEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryLRUCache {
  private cache = new Map<string, LRUEntry<unknown>>();
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item)
      const lru = this.cache.keys().next();
      if (!lru.done) this.cache.delete(lru.value);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  delPattern(pattern: string): void {
    const prefix = pattern.replace("*", "");
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

// ─── CacheService Implementation ───

export class CacheService implements ICacheService {
  private readonly memory: MemoryLRUCache;
  private readonly redisAvailable: boolean;
  private readonly memoryTTLMs: number;
  private subscribers: Array<(orgId: string) => void> = [];

  constructor(options?: { maxMemoryEntries?: number; memoryTTLSec?: number }) {
    this.memory = new MemoryLRUCache(options?.maxMemoryEntries ?? 1000);
    this.memoryTTLMs = (options?.memoryTTLSec ?? 30) * 1000;
    this.redisAvailable = this.checkRedis();
    if (!this.redisAvailable) {
      console.warn(WARN_MISSING_REDIS);
    }
  }

  private checkRedis(): boolean {
    try {
      return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    } catch {
      return false;
    }
  }

  // ─── Redis helpers (dynamic import to avoid crash if Redis not installed) ───

  private async redisGet<T>(key: string): Promise<T | null> {
    if (!this.redisAvailable) return null;
    try {
      const { getCached } = await import("@/lib/redis");
      return await getCached<T>(key);
    } catch {
      return null;
    }
  }

  private async redisSet<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    if (!this.redisAvailable) return;
    try {
      const { setCached } = await import("@/lib/redis");
      await setCached(key, data, ttlSeconds);
    } catch {
      // silently fail
    }
  }

  private async redisDel(key: string): Promise<void> {
    if (!this.redisAvailable) return;
    try {
      const redis = await import("@/lib/redis");
      await redis.invalidateCache(key);
    } catch {
      // silently fail
    }
  }

  private async redisDelPattern(pattern: string): Promise<void> {
    if (!this.redisAvailable) return;
    try {
      const redis = await import("@/lib/redis");
      await redis.invalidateCache(pattern);
    } catch {
      // silently fail
    }
  }

  // ─── ICacheService implementation ───

  async get<T>(key: string): Promise<T | null> {
    // L1: Redis
    if (this.redisAvailable) {
      const fromRedis = await this.redisGet<T>(key);
      if (fromRedis !== null) {
        // Warm memory cache
        this.memory.set(key, fromRedis, this.memoryTTLMs);
        return fromRedis;
      }
    }

    // L2: Memory fallback
    return this.memory.get<T>(key);
  }

  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    // Always set memory cache
    this.memory.set(key, data, this.memoryTTLMs);

    // Set Redis with a slightly shorter TTL to avoid stale edge
    if (this.redisAvailable) {
      await this.redisSet(key, data, ttlSeconds);
    }
  }

  async del(key: string): Promise<void> {
    this.memory.del(key);
    if (this.redisAvailable) {
      await this.redisDel(key);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    this.memory.delPattern(pattern);
    if (this.redisAvailable) {
      await this.redisDelPattern(pattern);
    }
  }

  async publishInvalidation(orgId: string): Promise<void> {
    const key = `entitlements:${orgId}`;
    await this.del(key);

    // Notify local subscribers
    for (const cb of this.subscribers) {
      try {
        cb(orgId);
      } catch {
        // ignore subscriber errors
      }
    }

    // Redis pub/sub for multi-instance fan-out
    if (this.redisAvailable) {
      try {
        const redis = (await import("@/lib/redis")).default;
        await redis.publish("entitlements:invalidate", orgId);
      } catch {
        // silently fail
      }
    }
  }

  subscribe(callback: (orgId: string) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }
}

/** Singleton instance */
let instance: CacheService | null = null;

export function getCacheService(): CacheService {
  if (!instance) {
    instance = new CacheService();
  }
  return instance;
}
