import redis from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

type RateLimitType = "general" | "auth" | "extension";

const limits: Record<RateLimitType, { max: number; window: number }> = {
  general: { max: 10, window: 10 },
  auth: { max: 5, window: 60 },
  extension: { max: 30, window: 60 },
};

export async function withRateLimit(
  req: NextRequest,
  type: RateLimitType = "general",
  identifier?: string,
): Promise<NextResponse | null> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";
  const key = `ratelimit:${identifier ?? ip}:${type}`;
  const { max, window } = limits[type];

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, window);
    }

    const remaining = Math.max(0, max - current);

    if (current > max) {
      const ttl = await redis.ttl(key);
      return NextResponse.json(
        { error: "Trop de requêtes. Réessayez plus tard." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(max),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + ttl),
          },
        },
      );
    }

    return null;
  } catch (error) {
    console.error("[RateLimit] Redis error, denying request:", error);
    return NextResponse.json(
      { error: "Service temporairement indisponible" },
      { status: 503 },
    );
  }
}

// Check rate limit without creating response — for use in other patterns
export async function checkRateLimit(
  key: string,
  type: RateLimitType = "general",
): Promise<boolean> {
  const limit = limits[type];
  try {
    const current = await redis.incr(`ratelimit:${key}:${type}`);
    if (current === 1) await redis.expire(`ratelimit:${key}:${type}`, limit.window);
    return current <= limit.max;
  } catch {
    return false;
  }
}
