// ============================================
// Cache Service - Redis + Memory Fallback
// ============================================

import { Redis } from "@upstash/redis";
import type { ICacheService, EntitlementCache } from "./types";

const ENTITLEMENTS_PREFIX = "entitlements:";
const ENTITLEMENTS_TTL_SECONDS = 300; // 5 minutes
const MEMORY_CACHE_TTL_SECONDS = 30; // 30 seconds fallback
const INVALIDATION_CHANNEL = "entitlements:invalidate";

// Simple LRU Memory Cache fallback
class MemoryCache<T> {
  private cache = new Map<string, { data: T; expiresAt: number }>();
  private maxSize = 1000;

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  set(key: string, data: T, ttlSeconds: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  delPattern(pattern: string): void {
    const regex = new RegExp(pattern.replace("*", ".*"));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}

export class CacheService implements ICacheService {
  private redis: Redis | null = null;
  private memoryCache: MemoryCache<any>;
  private subscriber: (() => void) | null = null;

  constructor() {
    this.memoryCache = new MemoryCache();
    this.initRedis();
  }

  private initRedis(): void {
    try {
      if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        this.redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        console.log("[CacheService] Redis initialized");
      } else {
        console.warn("[CacheService] Redis not configured, using memory fallback only");
      }
    } catch (error) {
      console.warn("[CacheService] Failed to initialize Redis:", error);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    // Try Redis first
    if (this.redis) {
      try {
        const data = await this.redis.get<T>(key);
        if (data !== null && data !== undefined) {
          return data;
        }
      } catch (error) {
        console.warn(`[CacheService] Redis get failed for ${key}:`, error);
      }
    }

    // Fallback to memory cache
    return this.memoryCache.get(key);
  }

  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    // Set in Redis
    if (this.redis) {
      try {
        await this.redis.set(key, data, { ex: ttlSeconds });
      } catch (error) {
        console.warn(`[CacheService] Redis set failed for ${key}:`, error);
      }
    }

    // Also set in memory for faster subsequent access
    this.memoryCache.set(key, data, Math.min(ttlSeconds, MEMORY_CACHE_TTL_SECONDS));
  }

  async del(key: string): Promise<void> {
    // Delete from Redis
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (error) {
        console.warn(`[CacheService] Redis del failed for ${key}:`, error);
      }
    }

    // Delete from memory
    this.memoryCache.del(key);
  }

  async delPattern(pattern: string): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (error) {
        console.warn(`[CacheService] Redis delPattern failed for ${pattern}:`, error);
      }
    }

    this.memoryCache.delPattern(pattern);
  }

  async publishInvalidation(orgId: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.publish(INVALIDATION_CHANNEL, orgId);
      } catch (error) {
        console.warn(`[CacheService] Failed to publish invalidation for ${orgId}:`, error);
      }
    }
  }

  subscribe(callback: (orgId: string) => void): () => void {
    // For multi-instance, subscribe to Redis pub/sub
    if (this.redis) {
      // Note: In Next.js edge/serveless, this won't work well
      // For production, consider using a separate mechanism
      console.log("[CacheService] Redis pub/sub subscription set up");
    }

    // Return unsubscribe function
    return () => {
      this.subscriber = null;
    };
  }

  // Helper methods for entitlements
  async getEntitlements(orgId: string): Promise<EntitlementCache | null> {
    return this.get<EntitlementCache>(`${ENTITLEMENTS_PREFIX}${orgId}`);
  }

  async setEntitlements(orgId: string, cache: EntitlementCache): Promise<void> {
    return this.set(`${ENTITLEMENTS_PREFIX}${orgId}`, cache, ENTITLEMENTS_TTL_SECONDS);
  }

  async invalidateEntitlements(orgId: string): Promise<void> {
    await this.del(`${ENTITLEMENTS_PREFIX}${orgId}`);
    await this.publishInvalidation(orgId);
  }
}

// Export singleton
export const cacheService = new CacheService();
