let redis: import("@upstash/redis").Redis | null = null

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = await import("@upstash/redis")
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
} catch {
  // Redis non disponible, rate limiting désactivé
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60000
): Promise<{
  allowed: boolean
  remaining: number
}> {
  if (!redis) {
    return { allowed: true, remaining: Infinity }
  }

  const now = Date.now()
  const windowKey = `ratelimit:${key}:${Math.floor(now / windowMs)}`

  const count = await redis.incr(windowKey)
  if (count === 1) {
    await redis.expire(windowKey, Math.ceil(windowMs / 1000))
  }

  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
  }
}
