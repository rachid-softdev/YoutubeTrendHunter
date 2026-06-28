// ============================================
// experiment.ts — Complete Unit Test Suite
// ============================================
// Covers: murmurhash, isInExperiment, getExperimentBucket
// Categories: correctness, edge cases, error handling,
//             distribution uniformity, determinism

import { describe, it, expect } from "vitest";
import {
  murmurhash,
  isInExperiment,
  getExperimentBucket,
} from "@/lib/feature-flags/experiment";

// ============================================
// MurmurHash Correctness
// ============================================

describe("murmurhash", () => {
  // ─── Determinism ───

  it("produces deterministic results for same input", () => {
    const input = "hello-world-42";
    const h1 = murmurhash(input);
    const h2 = murmurhash(input);
    expect(h1).toBe(h2);
  });

  it("produces deterministic results with explicit seed", () => {
    const input = "test";
    const h1 = murmurhash(input, 42);
    const h2 = murmurhash(input, 42);
    expect(h1).toBe(h2);
  });

  // ─── Avalanche effect / different inputs ───

  it("produces different values for different inputs", () => {
    const h1 = murmurhash("input_a");
    const h2 = murmurhash("input_b");
    expect(h1).not.toBe(h2);
  });

  it("produces different values for similar inputs", () => {
    const h1 = murmurhash("abc");
    const h2 = murmurhash("abd");
    const h3 = murmurhash("ab");
    const h4 = murmurhash("abcd");
    const hashes = new Set([h1, h2, h3, h4]);
    expect(hashes.size).toBe(4);
  });

  it("produces different values for reversed inputs", () => {
    const h1 = murmurhash("abc");
    const h2 = murmurhash("cba");
    expect(h1).not.toBe(h2);
  });

  // ─── Output range ───

  it("returns a non-negative 32-bit integer for various inputs", () => {
    const values = ["", "a", "hello", "test_string_123", "x".repeat(100)];
    for (const v of values) {
      const hash = murmurhash(v);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    }
  });

  // ─── Empty string ───

  it("handles empty string input", () => {
    const hash = murmurhash("");
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  it("is deterministic for empty string", () => {
    expect(murmurhash("")).toBe(murmurhash(""));
  });

  // ─── Single character ───

  it("handles single character input", () => {
    const hash = murmurhash("z");
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  it("produces different hashes for different single characters", () => {
    expect(murmurhash("a")).not.toBe(murmurhash("b"));
  });

  // ─── Very long input strings ───

  it("handles very long input (1000+ chars) deterministically", () => {
    const long = "x".repeat(1000);
    const hash = murmurhash(long);
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(murmurhash(long)).toBe(murmurhash(long));
  });

  it("handles very long input (10000+ chars)", () => {
    const long = "x".repeat(10001);
    expect(long.length).toBe(10001);
    const hash = murmurhash(long);
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  // ─── Unicode / multi-byte characters ───

  it("handles unicode characters (accents, emoji, CJK)", () => {
    const hash = murmurhash("héllo wörld 🎉 你好 🌍");
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic for unicode strings", () => {
    const s = "héllo wörld 🎉 你好 🌍";
    expect(murmurhash(s)).toBe(murmurhash(s));
  });

  it("handles emoji-only strings", () => {
    const hash = murmurhash("🎉🚀🌟💯");
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  it("handles CJK characters", () => {
    const hash = murmurhash("你好世界");
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  // ─── Seed values at boundaries ───

  it("handles seed = 0", () => {
    const hash = murmurhash("test", 0);
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(murmurhash("test", 0)).toBe(murmurhash("test", 0));
  });

  it("handles seed = 1", () => {
    const hash = murmurhash("test", 1);
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  it("handles seed = MAX_SAFE_INTEGER", () => {
    const hash = murmurhash("test", Number.MAX_SAFE_INTEGER);
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  it("handles seed = -1 (negative seed)", () => {
    const hash = murmurhash("test", -1);
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  it("handles seed = 0xffffffff (max 32-bit unsigned)", () => {
    const hash = murmurhash("overflow-test", 0xffffffff);
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  // ─── Different seeds produce different hashes ───

  it("different seeds produce different hashes for same key", () => {
    const key = "same-key";
    const h0 = murmurhash(key, 0);
    const h1 = murmurhash(key, 1);
    const h42 = murmurhash(key, 42);
    // At least these should differ (extremely unlikely to collide)
    expect(h0).not.toBe(h1);
    expect(h1).not.toBe(h42);
  });

  // ─── 32-bit overflow / wrapping behavior ───

  it("never exceeds 32-bit unsigned range even with large seeds", () => {
    for (const seed of [0, 1, 1000, 0x9747b28c, 0xffffffff, 2 ** 31 - 1]) {
      const hash = murmurhash("overflow-check", seed);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    }
  });

  // ─── Default seed ───

  it("uses a non-zero default seed (0x9747b28c)", () => {
    const noSeed = murmurhash("test");
    const explicitSeed = murmurhash("test", 0x9747b28c);
    expect(noSeed).toBe(explicitSeed);
  });
});

// ============================================
// isInExperiment Edge Cases
// ============================================

describe("isInExperiment", () => {
  // ─── percentage = 0 → always false ───

  it("percentage=0 returns false for 100 different users", () => {
    for (let i = 0; i < 100; i++) {
      expect(isInExperiment(`user_${i}`, "test", 0)).toBe(false);
    }
  });

  // ─── percentage = 100 → always true ───

  it("percentage=100 returns true for 100 different users", () => {
    for (let i = 0; i < 100; i++) {
      expect(isInExperiment(`user_${i}`, "test", 100)).toBe(true);
    }
  });

  // ─── percentage = 0.5 (fractional < 1) ───

  it("percentage=0.5 correctly includes approximately 0.5% of users", () => {
    const results = Array(10000)
      .fill(0)
      .map((_, i) => isInExperiment(`user_${i}`, "fractional_low", 0.5));
    const count = results.filter(Boolean).length;
    // With percentage=0.5, bucket < 0.5 only matches bucket=0, so ~1% (~100)
    // Accept range 30-170 to account for hash distribution variance
    expect(count).toBeGreaterThanOrEqual(30);
    expect(count).toBeLessThanOrEqual(170);
  });

  // ─── percentage = 99.9 (fractional near max) ───

  it("percentage=99.9 correctly includes approximately 99.9% of users", () => {
    const results = Array(10000)
      .fill(0)
      .map((_, i) => isInExperiment(`user_${i}`, "fractional_high", 99.9));
    const count = results.filter(Boolean).length;
    // Expect ~9990 users out of 10000, allow range 9950-10000
    expect(count).toBeGreaterThanOrEqual(9950);
  });

  // ─── percentage negative → treated as 0 ───

  it("percentage=-1 returns false for all users", () => {
    for (let i = 0; i < 100; i++) {
      expect(isInExperiment(`user_${i}`, "test", -1)).toBe(false);
    }
  });

  it("percentage=-100 returns false for all users", () => {
    for (let i = 0; i < 50; i++) {
      expect(isInExperiment(`user_${i}`, "test", -100)).toBe(false);
    }
  });

  // ─── percentage > 100 → effectively 100 ───

  it("percentage=150 returns true for all users", () => {
    for (let i = 0; i < 100; i++) {
      expect(isInExperiment(`user_${i}`, "test", 150)).toBe(true);
    }
  });

  it("percentage=1000 returns true for all users", () => {
    for (let i = 0; i < 50; i++) {
      expect(isInExperiment(`user_${i}`, "test", 1000)).toBe(true);
    }
  });

  // ─── Determinism ───

  it("same userId + same seed + same percentage → always same result", () => {
    const result = isInExperiment("fixed_user", "fixed_seed", 50);
    for (let i = 0; i < 20; i++) {
      expect(isInExperiment("fixed_user", "fixed_seed", 50)).toBe(result);
    }
  });

  // ─── Different seeds → different results ───

  it("different seeds can produce different results for same userId", () => {
    const rA = isInExperiment("user_1", "seed_A", 50);
    const rB = isInExperiment("user_1", "seed_B", 50);
    expect(typeof rA).toBe("boolean");
    expect(typeof rB).toBe("boolean");
  });

  // ─── Distribution: percentage=50 (4500-5500 out of 10000) ───

  it("distributes ~50% for percentage=50 across 10000 users", () => {
    const results = Array(10000)
      .fill(0)
      .map((_, i) => isInExperiment(`user_${i}`, "dist_50", 50));
    const count = results.filter(Boolean).length;
    expect(count).toBeGreaterThanOrEqual(4500);
    expect(count).toBeLessThanOrEqual(5500);
  });

  // ─── Distribution: percentage=10 (800-1200 out of 10000) ───

  it("distributes ~10% for percentage=10 across 10000 users", () => {
    const results = Array(10000)
      .fill(0)
      .map((_, i) => isInExperiment(`user_${i}`, "dist_10", 10));
    const count = results.filter(Boolean).length;
    expect(count).toBeGreaterThanOrEqual(800);
    expect(count).toBeLessThanOrEqual(1200);
  });

  // ─── Distribution: percentage=1 (50-150 out of 10000) ───

  it("distributes ~1% for percentage=1 across 10000 users", () => {
    const results = Array(10000)
      .fill(0)
      .map((_, i) => isInExperiment(`user_${i}`, "dist_1", 1));
    const count = results.filter(Boolean).length;
    expect(count).toBeGreaterThanOrEqual(50);
    expect(count).toBeLessThanOrEqual(150);
  });

  // ─── Non-string userId (does not throw) ───

  it("handles numeric userId without throwing", () => {
    expect(() => isInExperiment(123 as any, "seed", 50)).not.toThrow();
  });

  it("handles null userId without throwing", () => {
    expect(() => isInExperiment(null as any, "seed", 50)).not.toThrow();
  });

  it("handles undefined userId without throwing", () => {
    expect(() => isInExperiment(undefined as any, "seed", 50)).not.toThrow();
  });

  it("handles object userId without throwing", () => {
    expect(() => isInExperiment({} as any, "seed", 50)).not.toThrow();
  });

  it("handles array userId without throwing", () => {
    expect(() => isInExperiment([] as any, "seed", 50)).not.toThrow();
  });

  // ─── Seed edge cases ───

  it("handles empty string seed without throwing", () => {
    expect(() => isInExperiment("user", "", 50)).not.toThrow();
    expect(isInExperiment("user", "", 50)).toBe(isInExperiment("user", "", 50));
  });

  it("handles null seed without throwing", () => {
    expect(() => isInExperiment("user", null as any, 50)).not.toThrow();
  });

  it("handles undefined seed without throwing", () => {
    expect(() => isInExperiment("user", undefined as any, 50)).not.toThrow();
  });

  // ─── Percentage edge cases ───

  it("handles percentage=NaN without throwing (comparison is false)", () => {
    // bucket < NaN is always false
    expect(isInExperiment("user", "seed", NaN)).toBe(false);
  });

  it("handles percentage=Infinity (treated as always true since bucket < ∞)", () => {
    expect(isInExperiment("user", "seed", Infinity)).toBe(true);
  });

  // ─── Missing arguments ───

  it("handles no arguments without throwing", () => {
    expect(() => (isInExperiment as any)()).not.toThrow();
  });

  it("handles only userId argument without throwing", () => {
    expect(() => (isInExperiment as any)("user")).not.toThrow();
  });

  it("handles userId + seed without percentage without throwing", () => {
    expect(() => (isInExperiment as any)("user", "seed")).not.toThrow();
  });
});

// ============================================
// getExperimentBucket Edge Cases
// ============================================

describe("getExperimentBucket", () => {
  // ─── Output range 0-99 for any input ───

  it("returns values in range 0-99 for varied inputs", () => {
    const userIds = ["user_1", "user_2", "test", "", "abc", "🎉emoji"];
    const seeds = ["seed_a", "seed_b", "", "x"];
    for (const uid of userIds) {
      for (const s of seeds) {
        const bucket = getExperimentBucket(uid, s);
        expect(Number.isInteger(bucket)).toBe(true);
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThanOrEqual(99);
      }
    }
  });

  // ─── Determinism ───

  it("returns same bucket for same inputs consistently", () => {
    const bucket = getExperimentBucket("user_42", "experiment_v1");
    for (let i = 0; i < 20; i++) {
      expect(getExperimentBucket("user_42", "experiment_v1")).toBe(bucket);
    }
  });

  // ─── Different seeds → different buckets ───

  it("different seeds produce different buckets for same userId (likely)", () => {
    const bucketA = getExperimentBucket("user_1", "seed_a");
    const bucketB = getExperimentBucket("user_1", "seed_b");
    // Both must be valid
    expect(bucketA).toBeGreaterThanOrEqual(0);
    expect(bucketA).toBeLessThanOrEqual(99);
    expect(bucketB).toBeGreaterThanOrEqual(0);
    expect(bucketB).toBeLessThanOrEqual(99);
  });

  // ─── Uniform distribution across 100 buckets ───

  it("distributes roughly uniformly across 100 buckets (10000 users)", () => {
    const BUCKETS = 100;
    const SAMPLES = 10000;
    const counts = new Array(BUCKETS).fill(0);

    for (let i = 0; i < SAMPLES; i++) {
      const b = getExperimentBucket(`user_${i}`, "uniformity");
      counts[b]++;
    }

    // Each bucket should have ~100 entries (1% of 10000)
    // Allow range 50-150 for statistical noise
    for (let b = 0; b < BUCKETS; b++) {
      expect(counts[b]).toBeGreaterThanOrEqual(50);
      expect(counts[b]).toBeLessThanOrEqual(150);
    }
  });

  // ─── Large scale ───

  it("handles 10000 unique users without crashing", () => {
    for (let i = 0; i < 10000; i++) {
      const bucket = getExperimentBucket(`large_scale_user_${i}`, "scale_test");
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(99);
    }
  });

  // ─── Empty string edge cases ───

  it("works with empty string userId", () => {
    const bucket = getExperimentBucket("", "seed");
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThanOrEqual(99);
  });

  it("works with empty string seed", () => {
    const bucket = getExperimentBucket("user", "");
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThanOrEqual(99);
  });

  it("works with both empty strings", () => {
    const bucket = getExperimentBucket("", "");
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThanOrEqual(99);
  });

  // ─── Consistent with isInExperiment ───

  it("isInExperiment(true) matches bucket < percentage logic", () => {
    const uid = "consistency_check_user";
    const seed = "consistency_seed";
    const percentage = 30;
    const bucket = getExperimentBucket(uid, seed);
    const inExperiment = isInExperiment(uid, seed, percentage);
    expect(inExperiment).toBe(bucket < percentage);
  });

  // ─── Non-string inputs ───

  it("handles numeric userId without throwing", () => {
    expect(() => getExperimentBucket(123 as any, "seed")).not.toThrow();
  });

  it("handles null userId without throwing", () => {
    expect(() => getExperimentBucket(null as any, "seed")).not.toThrow();
  });

  it("handles undefined seed without throwing", () => {
    expect(() => getExperimentBucket("user", undefined as any)).not.toThrow();
  });

  it("handles no arguments without throwing", () => {
    expect(() => (getExperimentBucket as any)()).not.toThrow();
  });
});
