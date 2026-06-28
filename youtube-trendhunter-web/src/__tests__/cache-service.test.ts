// ============================================
// CacheService + MemoryLRUCache — Complete Test Suite
// ============================================
//
// Tests the MemoryLRUCache indirectly via CacheService
// since the LRU class is not exported.
//
// Also tests CacheService in both memory-only and
// redis-available modes.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { CacheService } from "@/lib/feature-flags/cache-service";

// ── Helpers ──

function clearRedisEnv() {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

function setRedisEnv() {
  process.env.UPSTASH_REDIS_REST_URL = "https://test-redis.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token-123";
}

const ORIGINAL_REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const ORIGINAL_REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function restoreRedisEnv() {
  if (ORIGINAL_REDIS_URL === undefined) {
    delete process.env.UPSTASH_REDIS_REST_URL;
  } else {
    process.env.UPSTASH_REDIS_REST_URL = ORIGINAL_REDIS_URL;
  }
  if (ORIGINAL_REDIS_TOKEN === undefined) {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  } else {
    process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL_REDIS_TOKEN;
  }
}

// ── Mock @/lib/redis ──
// Uses bare vi.fn() inside the factory (no hoisted refs); test code gets
// references via dynamic import which vitest intercepts with the mock.
// getCached defaults to returning null (matching the real module's T | null return type),
// so that CacheService's `fromRedis !== null` guard correctly identifies cache misses.
vi.mock("@/lib/redis", () => ({
  getCached: vi.fn(() => Promise.resolve(null)),
  setCached: vi.fn(),
  invalidateCache: vi.fn(),
  default: { publish: vi.fn() },
}));

// ── Get typed access to the mock module ──
// We import once and re-use; vitest caches the mock so every dynamic import
// returns the same function references.
type RedisMock = {
  getCached: ReturnType<typeof vi.fn>;
  setCached: ReturnType<typeof vi.fn>;
  invalidateCache: ReturnType<typeof vi.fn>;
  default: { publish: ReturnType<typeof vi.fn> };
};

let redis: RedisMock;

// ──────────────────────────────────────────────────────────────
// MemoryLRUCache Behaviour (tested via CacheService)
// ──────────────────────────────────────────────────────────────
//
// These tests create a CacheService with redis unavailable so
// all operations go through MemoryLRUCache directly.
// ──────────────────────────────────────────────────────────────

describe("MemoryLRUCache (via CacheService)", () => {
  beforeEach(() => {
    clearRedisEnv();
    vi.clearAllMocks();
  });

  // ── Basic get/set ──

  it("get returns null for missing key", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    const result = await cache.get("nonexistent");
    expect(result).toBeNull();
  });

  it("get returns null for expired key", async () => {
    vi.useFakeTimers();
    const cache = new CacheService({ maxMemoryEntries: 10, memoryTTLSec: 0.05 }); // 50ms TTL
    await cache.set("key", "value", 999);
    // Immediately accessible
    expect(await cache.get("key")).toBe("value");
    // Advance past TTL
    vi.advanceTimersByTime(60);
    expect(await cache.get("key")).toBeNull();
    vi.useRealTimers();
  });

  it("get returns value for valid key", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("greeting", "hello", 60);
    const result = await cache.get("greeting");
    expect(result).toBe("hello");
  });

  // ── Value type preservation ──

  it("set/get round-trip preserves string values", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("k", "hello-world", 60);
    expect(await cache.get("k")).toBe("hello-world");
  });

  it("set/get round-trip preserves object values", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    const obj = { name: "test", count: 42, nested: { a: 1 } };
    await cache.set("k", obj, 60);
    expect(await cache.get("k")).toEqual(obj);
  });

  it("set/get round-trip preserves number values", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("k", 3.14, 60);
    expect(await cache.get("k")).toBe(3.14);
  });

  it("set/get round-trip preserves array values", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    const arr = [1, "two", { three: 3 }];
    await cache.set("k", arr, 60);
    expect(await cache.get("k")).toEqual(arr);
  });

  it("set/get round-trip preserves null values", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("k", null, 60);
    const result = await cache.get("k");
    expect(result).toBeNull();
  });

  // ── LRU eviction ──

  it("LRU eviction — oldest entry is evicted when cache exceeds max size", async () => {
    const cache = new CacheService({ maxMemoryEntries: 3 });
    await cache.set("a", "A", 60);
    await cache.set("b", "B", 60);
    await cache.set("c", "C", 60);
    // Cache is at capacity. Adding a 4th entry should evict "a" (oldest).
    await cache.set("d", "D", 60);

    expect(await cache.get("a")).toBeNull(); // evicted
    expect(await cache.get("b")).toBe("B");
    expect(await cache.get("c")).toBe("C");
    expect(await cache.get("d")).toBe("D");
  });

  it("LRU reordering — accessing oldest entry keeps it alive during eviction", async () => {
    const cache = new CacheService({ maxMemoryEntries: 3 });
    await cache.set("a", "A", 60);
    await cache.set("b", "B", 60);
    await cache.set("c", "C", 60);

    // Access "a" (oldest) — it gets moved to MRU position
    expect(await cache.get("a")).toBe("A");

    // Adding "d" evicts "b" (now the oldest, since "a" was accessed)
    await cache.set("d", "D", 60);

    expect(await cache.get("a")).toBe("A"); // was accessed, still present
    expect(await cache.get("b")).toBeNull(); // evicted
    expect(await cache.get("c")).toBe("C");
    expect(await cache.get("d")).toBe("D");
  });

  it("get moves entry to MRU position (tested via eviction order)", async () => {
    const cache = new CacheService({ maxMemoryEntries: 3 });
    await cache.set("a", "A", 60);
    await cache.set("b", "B", 60);
    await cache.set("c", "C", 60);

    // Access "b" (middle) — moves to MRU
    expect(await cache.get("b")).toBe("B");

    // Adding "d" should evict "a" (now the oldest — "a" was never accessed after insert)
    await cache.set("d", "D", 60);

    expect(await cache.get("a")).toBeNull(); // evicted (was LRU)
    expect(await cache.get("b")).toBe("B"); // preserved (moved to MRU)
    expect(await cache.get("c")).toBe("C"); // preserved
    expect(await cache.get("d")).toBe("D"); // new entry
  });

  // ── Deletion ──

  it("del removes a key from cache", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("key", "value", 60);
    await cache.del("key");
    expect(await cache.get("key")).toBeNull();
  });

  it("delPattern removes keys matching a prefix pattern", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("prefix:a", 1, 60);
    await cache.set("prefix:b", 2, 60);
    await cache.set("other:c", 3, 60);

    await cache.delPattern("prefix:*");

    expect(await cache.get("prefix:a")).toBeNull();
    expect(await cache.get("prefix:b")).toBeNull();
    expect(await cache.get("other:c")).toBe(3); // not deleted
  });

  it("delPattern does not affect non-matching keys", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("alpha", 1, 60);
    await cache.set("beta", 2, 60);

    await cache.delPattern("gamma:*");

    expect(await cache.get("alpha")).toBe(1);
    expect(await cache.get("beta")).toBe(2);
  });

  it("clear removes all keys from cache", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("a", 1, 60);
    await cache.set("b", 2, 60);
    await cache.set("c", 3, 60);

    // Use delPattern with "*" to clear all (CacheService does not expose clear())
    await cache.delPattern("*");

    expect(await cache.get("a")).toBeNull();
    expect(await cache.get("b")).toBeNull();
    expect(await cache.get("c")).toBeNull();
  });

  it("set overwrites existing key with new value", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("key", "original", 60);
    await cache.set("key", "updated", 60);

    expect(await cache.get("key")).toBe("updated");
  });

  it("TTL expiry — entry becomes inaccessible after TTL elapses", async () => {
    vi.useFakeTimers();
    const cache = new CacheService({ maxMemoryEntries: 10, memoryTTLSec: 0.05 }); // 50ms

    await cache.set("ephemeral", "now-you-see-me", 999);
    expect(await cache.get("ephemeral")).toBe("now-you-see-me");

    vi.advanceTimersByTime(60);
    expect(await cache.get("ephemeral")).toBeNull();

    vi.useRealTimers();
  });
});

// ──────────────────────────────────────────────────────────────
// CacheService — Memory-Only Mode (redis unavailable)
// ──────────────────────────────────────────────────────────────

describe("CacheService — memory-only mode", () => {
  beforeEach(() => {
    clearRedisEnv();
    vi.clearAllMocks();
  });

  it("get falls through to memory when redis is unavailable", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("key", "mem-value", 60);
    const result = await cache.get("key");
    expect(result).toBe("mem-value");
  });

  it("set writes to memory when redis is unavailable", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("key", "stored", 60);
    expect(await cache.get("key")).toBe("stored");
  });

  it("del removes key from memory when redis is unavailable", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("key", "value", 60);
    await cache.del("key");
    expect(await cache.get("key")).toBeNull();
  });

  it("delPattern removes matching keys from memory when redis is unavailable", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("foo:1", 10, 60);
    await cache.set("foo:2", 20, 60);
    await cache.set("bar:1", 30, 60);

    await cache.delPattern("foo:*");

    expect(await cache.get("foo:1")).toBeNull();
    expect(await cache.get("foo:2")).toBeNull();
    expect(await cache.get("bar:1")).toBe(30);
  });

  it("publishInvalidation calls del with entitlements:{orgId} prefix", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    // Seed the cache with the key that publishInvalidation will delete
    await cache.set("entitlements:org-123", "cached-data", 60);

    await cache.publishInvalidation("org-123");

    // The key should have been deleted
    expect(await cache.get("entitlements:org-123")).toBeNull();
  });

  it("publishInvalidation notifies subscribers with the orgId", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    const subscriber = vi.fn();
    cache.subscribe(subscriber);

    await cache.publishInvalidation("org-456");

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith("org-456");
  });

  it("publishInvalidation notifies multiple subscribers", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    const sub1 = vi.fn();
    const sub2 = vi.fn();
    cache.subscribe(sub1);
    cache.subscribe(sub2);

    await cache.publishInvalidation("org-789");

    expect(sub1).toHaveBeenCalledWith("org-789");
    expect(sub2).toHaveBeenCalledWith("org-789");
  });

  it("subscribe returns an unsubscribe function", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    const subscriber = vi.fn();
    const unsubscribe = cache.subscribe(subscriber);

    expect(typeof unsubscribe).toBe("function");
  });

  it("after calling unsubscribe, subscriber is not notified", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    const subscriber = vi.fn();
    const unsubscribe = cache.subscribe(subscriber);

    unsubscribe();
    await cache.publishInvalidation("org-999");

    expect(subscriber).not.toHaveBeenCalled();
  });

  it("unsubscribe only removes the correct subscriber", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    const subA = vi.fn();
    const subB = vi.fn();
    const unsubA = cache.subscribe(subA);
    cache.subscribe(subB);

    unsubA();
    await cache.publishInvalidation("org-111");

    expect(subA).not.toHaveBeenCalled();
    expect(subB).toHaveBeenCalledWith("org-111");
  });

  it("constructor does not throw when env vars are not set", () => {
    clearRedisEnv();
    expect(() => new CacheService({ maxMemoryEntries: 10 })).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────
// CacheService — Redis Mode (redis available)
// ──────────────────────────────────────────────────────────────

describe("CacheService — redis mode", () => {
  beforeAll(() => setRedisEnv());
  afterAll(() => restoreRedisEnv());

  beforeEach(async () => {
    vi.clearAllMocks();
    redis = (await import("@/lib/redis")) as unknown as RedisMock;
  });

  it("get checks redis first when redis is available", async () => {
    redis.getCached.mockResolvedValue("from-redis");
    const cache = new CacheService({ maxMemoryEntries: 10 });

    const result = await cache.get("test-key");

    expect(redis.getCached).toHaveBeenCalledWith("test-key");
    expect(result).toBe("from-redis");
  });

  it("get warms memory cache from redis result", async () => {
    redis.getCached.mockResolvedValue("redis-value");
    const cache = new CacheService({ maxMemoryEntries: 10 });

    // First get — comes from redis; should fill memory cache
    const first = await cache.get("warm-key");
    expect(first).toBe("redis-value");

    // Now make redis return null — second get should hit memory cache
    redis.getCached.mockResolvedValue(null);
    const second = await cache.get("warm-key");
    expect(second).toBe("redis-value");
  });

  it("get returns memory value when redis returns null", async () => {
    redis.getCached.mockResolvedValue(null);
    const cache = new CacheService({ maxMemoryEntries: 10 });

    // First call: redis returns null, memory has nothing → null
    const first = await cache.get("miss-key");
    expect(first).toBeNull();

    // Manually set in memory
    await cache.set("miss-key", "mem-value", 60);

    // Second call: redis still returns null, but memory has the value
    const second = await cache.get("miss-key");
    expect(second).toBe("mem-value");
  });

  it("set writes to both memory and redis", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });

    await cache.set("dual-key", "dual-value", 120);

    // Verify it was written to redis (via mock)
    expect(redis.setCached).toHaveBeenCalledWith("dual-key", "dual-value", 120);

    // Verify it's in memory (redis returns null, but memory has it)
    redis.getCached.mockResolvedValue(null);
    const memResult = await cache.get("dual-key");
    expect(memResult).toBe("dual-value");
  });

  it("del removes key from both memory and redis", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });

    // Put data in both layers
    await cache.set("del-key", "value", 60);
    expect(redis.setCached).toHaveBeenCalled();

    // Now delete
    vi.clearAllMocks();
    await cache.del("del-key");

    // Verify redis invalidation was called
    expect(redis.invalidateCache).toHaveBeenCalledWith("del-key");

    // Verify memory is also cleared
    expect(await cache.get("del-key")).toBeNull();
  });

  it("delPattern removes from memory and calls redis invalidation", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("pat:a", "A", 60);
    await cache.set("pat:b", "B", 60);
    await cache.set("other:x", "X", 60);

    vi.clearAllMocks();
    await cache.delPattern("pat:*");

    // Redis invalidation called with the pattern
    expect(redis.invalidateCache).toHaveBeenCalledWith("pat:*");

    // Memory keys are removed
    expect(await cache.get("pat:a")).toBeNull();
    expect(await cache.get("pat:b")).toBeNull();
    expect(await cache.get("other:x")).toBe("X");
  });

  it("get returns redis null when memory is also empty", async () => {
    redis.getCached.mockResolvedValue(null);
    const cache = new CacheService({ maxMemoryEntries: 10 });

    const result = await cache.get("empty-key");
    expect(result).toBeNull();
    expect(redis.getCached).toHaveBeenCalledWith("empty-key");
  });

  it("publishInvalidation publishes event to redis pub/sub", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });

    await cache.publishInvalidation("org-555");

    // Should have invalidated the cache key
    expect(redis.invalidateCache).toHaveBeenCalledWith("entitlements:org-555");

    // Should have published to redis pub/sub
    expect(redis.default.publish).toHaveBeenCalledWith(
      "entitlements:invalidate",
      "org-555",
    );
  });

  it("publishInvalidation notifies subscribers AND publishes to redis", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    const subscriber = vi.fn();
    cache.subscribe(subscriber);

    await cache.publishInvalidation("org-777");

    // Subscriber notified
    expect(subscriber).toHaveBeenCalledWith("org-777");
    // Redis pub/sub
    expect(redis.default.publish).toHaveBeenCalledWith(
      "entitlements:invalidate",
      "org-777",
    );
  });
});

// ──────────────────────────────────────────────────────────────
// Error resilience
// ──────────────────────────────────────────────────────────────

describe("CacheService — error resilience", () => {
  beforeAll(() => setRedisEnv());
  afterAll(() => restoreRedisEnv());

  beforeEach(async () => {
    vi.resetAllMocks(); // Use resetAllMocks to fully clear implementations
    redis = (await import("@/lib/redis")) as unknown as RedisMock;
  });

  it("get falls back gracefully when redis throws", async () => {
    // Use mockImplementationOnce instead of mockRejectedValue for safety
    redis.getCached.mockImplementationOnce(() =>
      Promise.reject(new Error("Redis connection failed")),
    );
    const cache = new CacheService({ maxMemoryEntries: 10 });

    // Should not throw — catches internally and falls through to memory
    const result = await cache.get("error-key");
    expect(result).toBeNull();
  });

  it("set does not throw when redis setCached throws", async () => {
    redis.setCached.mockImplementationOnce(() =>
      Promise.reject(new Error("Redis write failed")),
    );
    const cache = new CacheService({ maxMemoryEntries: 10 });

    // Should not throw — catches internally
    await expect(cache.set("key", "value", 60)).resolves.toBeUndefined();

    // Memory should still have the value
    expect(await cache.get("key")).toBe("value");
  });

  it("del does not throw when redis invalidateCache throws", async () => {
    redis.invalidateCache.mockImplementationOnce(() =>
      Promise.reject(new Error("Redis del failed")),
    );
    const cache = new CacheService({ maxMemoryEntries: 10 });
    await cache.set("key", "value", 60);

    // Should not throw
    await expect(cache.del("key")).resolves.toBeUndefined();

    // Memory should be cleared
    expect(await cache.get("key")).toBeNull();
  });

  it("publishInvalidation does not throw when redis publish throws", async () => {
    redis.default.publish.mockImplementationOnce(() =>
      Promise.reject(new Error("Redis publish failed")),
    );
    const cache = new CacheService({ maxMemoryEntries: 10 });

    await expect(
      cache.publishInvalidation("org-throw"),
    ).resolves.toBeUndefined();
  });

  it("subscriber errors do not propagate from publishInvalidation", async () => {
    const cache = new CacheService({ maxMemoryEntries: 10 });
    const throwingSub = vi.fn(() => {
      throw new Error("Subscriber crashed");
    });
    const goodSub = vi.fn();
    cache.subscribe(throwingSub);
    cache.subscribe(goodSub);

    // Should not throw despite the bad subscriber
    await expect(
      cache.publishInvalidation("org-crash"),
    ).resolves.toBeUndefined();

    // Good subscriber should still have been called
    expect(goodSub).toHaveBeenCalledWith("org-crash");
  });
});

// ──────────────────────────────────────────────────────────────
// Singleton getCacheService
// ──────────────────────────────────────────────────────────────

describe("getCacheService singleton", () => {
  it("returns a CacheService instance", async () => {
    clearRedisEnv();
    const { getCacheService: getCS } = await import(
      "@/lib/feature-flags/cache-service"
    );
    const instance = getCS();
    expect(instance).toBeInstanceOf(CacheService);
  });

  it("returns the same instance on repeated calls", async () => {
    clearRedisEnv();
    const { getCacheService: getCS } = await import(
      "@/lib/feature-flags/cache-service"
    );
    const instance1 = getCS();
    const instance2 = getCS();
    expect(instance1).toBe(instance2);
  });
});
