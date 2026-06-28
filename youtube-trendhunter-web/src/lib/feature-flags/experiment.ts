// ============================================
// A/B Testing — Stable Bucketing via MurmurHash
// ============================================

const SEED = 0x9747b28c;

/**
 * MurmurHash3 (x86 32-bit) — returns a non-negative 32-bit integer.
 * Implementation adapted for stability across platforms.
 */
export function murmurhash(key: string, seed: number = SEED): number {
  let h = seed | 0;
  const remainder = key.length & 3;
  const bytes = key.length - remainder;
  let i = 0;

  while (i < bytes) {
    let k =
      (key.charCodeAt(i) & 0xff) |
      ((key.charCodeAt(++i) & 0xff) << 8) |
      ((key.charCodeAt(++i) & 0xff) << 16) |
      ((key.charCodeAt(++i) & 0xff) << 24);

    ++i;

    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);

    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64;
  }

  let k = 0;
  switch (remainder) {
    case 3:
      k ^= (key.charCodeAt(i + 2) & 0xff) << 16;
    // falls through
    case 2:
      k ^= (key.charCodeAt(i + 1) & 0xff) << 8;
    // falls through
    case 1:
      k ^= key.charCodeAt(i) & 0xff;
      k = Math.imul(k, 0xcc9e2d51);
      k = (k << 15) | (k >>> 17);
      k = Math.imul(k, 0x1b873593);
      h ^= k;
  }

  h ^= key.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  // Ensure non-negative
  return h >>> 0;
}

/**
 * Determine if a user is part of an experiment.
 * Uses stable hashing: same userId + seed → always the same bucket.
 *
 * @param userId  - The user's identifier (stable across sessions)
 * @param seed    - The experiment seed (change to re-segment)
 * @param percentage - Percentage of users in experiment (0-100)
 */
export function isInExperiment(
  userId: string,
  seed: string,
  percentage: number,
): boolean {
  const hash = murmurhash(`${seed}:${userId}`);
  const bucket = hash % 100;
  return bucket < percentage;
}

/**
 * Get the bucket number (0-99) for a user in an experiment.
 * Useful for debugging distribution.
 */
export function getExperimentBucket(userId: string, seed: string): number {
  const hash = murmurhash(`${seed}:${userId}`);
  return hash % 100;
}
