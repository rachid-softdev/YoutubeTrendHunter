// ============================================
// Feature Flag Middlewares — Framework-agnostic factories
// ============================================
//
// These factory functions wrap handlers with feature gate checks.
// They are NOT coupled to any framework — pass NextRequest or Express req.
//
// Usage Next.js App Router:
//   export const POST = withFeature("EXPORT_PDF",
//     withLimit("EXPORT_PDF",
//       async (req) => { ... }
//     )
//   )
//
// Usage Express:
//   router.post("/export/pdf",
//     requireFeature("EXPORT_PDF"),
//     consumeFeature("EXPORT_PDF"),
//     exportHandler
//   )
// ============================================

import type { FeatureGateService } from "./feature-gate.service";
import {
  FeatureNotAvailableError,
  LimitReachedError,
  SubscriptionExpiredError,
} from "./errors";
import { log } from "@/lib/logger";

// ─── Types ───

export interface AuthSession {
  orgId: string;
  userId: string;
  plan?: string;
}

/**
 * Resolve the orgId + userId from the current request/session.
 * Implement this per-framework.
 */
export type SessionResolver = () => Promise<AuthSession>;

// ─── Factory: requireFeature ───

/**
 * Creates a middleware that checks if a feature is available.
 * Throws FeatureNotAvailableError (403) if not.
 *
 * Usage (Express):
 *   router.post("/export", requireFeature(gate, resolveSession)("EXPORT_PDF"), handler)
 */
export function requireFeature(
  gate: FeatureGateService,
  resolveSession: SessionResolver,
) {
  return (featureKey: string) => {
    return async () => {
      const { orgId } = await resolveSession();
      await gate.assertFeature(orgId, featureKey);
    };
  };
}

// ─── Factory: requireLimit ───

/**
 * Creates a handler wrapper that checks if consumption is possible.
 * Throws LimitReachedError (402) if limit reached.
 */
export function requireLimit(
  gate: FeatureGateService,
  resolveSession: SessionResolver,
) {
  return (featureKey: string, amount = 1) => {
    return async <T>(handler: () => Promise<T>): Promise<T> => {
      const { orgId, userId } = await resolveSession();
      const canConsume = await gate.canConsume(orgId, featureKey, amount);
      if (!canConsume) {
        const limit = await gate.getLimit(orgId, featureKey);
        const usage = await gate["repository"].getCurrentUsage(orgId, featureKey);
        const used = usage?.usageCount ?? 0;
        const resetAt = usage?.periodEnd?.toISOString() ?? new Date().toISOString();

        log("warn", "[FeatureGate] Limit check failed", {
          orgId,
          userId,
          feature: featureKey,
          limit,
          used,
          attempted: amount,
        });

        throw new LimitReachedError(featureKey, limit, used, resetAt);
      }
      return handler();
    };
  };
}

// ─── Factory: consumeFeature ───

/**
 * Creates a handler wrapper that checks AND consumes a feature.
 * Throws LimitReachedError (402) if limit reached.
 */
export function consumeFeature(
  gate: FeatureGateService,
  resolveSession: SessionResolver,
) {
  return (featureKey: string, amount = 1) => {
    return async <T>(handler: () => Promise<T>): Promise<T> => {
      const { orgId, userId } = await resolveSession();
      const result = await gate.consume(orgId, featureKey, amount);

      if (!result.success) {
        log("warn", "[FeatureGate] Consume failed", {
          orgId,
          userId,
          feature: featureKey,
          error: result.error,
          used: result.used,
        });

        if (result.error === "LIMIT_REACHED" && result.limitReached) {
          throw new LimitReachedError(
            result.limitReached.feature,
            result.limitReached.limit,
            result.limitReached.used,
            result.limitReached.resetAt,
          );
        }
        throw new FeatureNotAvailableError(featureKey, "", "");
      }

      return handler();
    };
  };
}

// ─── Higher-order: withFeature (Next.js style) ───

/**
 * Wraps a Next.js route handler with a feature gate check.
 *
 * Usage:
 *   export const POST = withFeature(gate, resolveSession)("EXPORT_PDF", handler)
 */
export function withFeature(
  gate: FeatureGateService,
  resolveSession: SessionResolver,
) {
  return (featureKey: string) => {
    return <T>(handler: (req: T) => Promise<Response>) => {
      return async (req: T): Promise<Response> => {
        try {
          const { orgId } = await resolveSession();
          await gate.assertFeature(orgId, featureKey);
          return await handler(req);
        } catch (err) {
          if (err instanceof FeatureNotAvailableError) {
            // Return structured error response
            const { NextResponse } = await import("next/server");
            return NextResponse.json(err.toJSON(), { status: err.statusCode });
          }
          throw err;
        }
      };
    };
  };
}

// ─── Higher-order: withLimit (Next.js style) ───

/**
 * Wraps a Next.js route handler with limit check and consumption.
 */
export function withLimit(
  gate: FeatureGateService,
  resolveSession: SessionResolver,
) {
  return (featureKey: string, amount = 1) => {
    return <T>(handler: (req: T) => Promise<Response>) => {
      return async (req: T): Promise<Response> => {
        try {
          const { orgId, userId } = await resolveSession();
          const result = await gate.consume(orgId, featureKey, amount);

          if (!result.success) {
            const { NextResponse } = await import("next/server");
            if (result.error === "LIMIT_REACHED" && result.limitReached) {
              return NextResponse.json(
                {
                  error: "LIMIT_REACHED",
                  feature: result.limitReached.feature,
                  limit: result.limitReached.limit,
                  used: result.limitReached.used,
                  reset_at: result.limitReached.resetAt,
                  upgrade_url: "/billing/upgrade",
                },
                { status: 402 },
              );
            }
            return NextResponse.json(
              { error: "FEATURE_NOT_AVAILABLE", feature: featureKey, upgrade_url: "/billing/upgrade" },
              { status: 403 },
            );
          }

          return await handler(req);
        } catch (err) {
          if (err instanceof LimitReachedError || err instanceof FeatureNotAvailableError) {
            const { NextResponse } = await import("next/server");
            return NextResponse.json(
              (err as FeatureNotAvailableError | LimitReachedError).toJSON(),
              { status: (err as FeatureNotAvailableError | LimitReachedError).statusCode },
            );
          }
          throw err;
        }
      };
    };
  };
}
