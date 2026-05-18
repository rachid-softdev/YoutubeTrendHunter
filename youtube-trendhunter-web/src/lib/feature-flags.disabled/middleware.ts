// ============================================
// Middleware Factories - Framework Agnostic
// ============================================

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { featureGateService } from "./service"
import { FeatureNotAvailableError, LimitReachedError, SubscriptionExpiredError } from "./types"

export type { NextRequest, NextResponse }

// ============================================
// Types for Middleware Context
// ============================================

export interface FeatureContext {
  orgId: string
  userId?: string
}

// ============================================
// Helper: Extract orgId from request
// ============================================

/**
 * Extract orgId from session/auth. Override in production to use proper auth.
 * This is a placeholder - integrate with your actual auth system.
 */
export async function getOrgIdFromRequest(request: NextRequest): Promise<string | null> {
  // Try to get orgId from query params (for simple cases)
  const orgIdFromQuery = request.nextUrl.searchParams.get("orgId")
  if (orgIdFromQuery) return orgIdFromQuery

  // In production: extract from session/JWT
  // const session = await getSession()
  // return session.orgId

  return null
}

/**
 * Extract userId from request
 */
export async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  const userIdFromQuery = request.nextUrl.searchParams.get("userId")
  if (userIdFromQuery) return userIdFromQuery

  // In production: extract from session/JWT

  return null
}

// ============================================
// Middleware Factories
// ============================================

/**
 * Create a middleware that checks if a feature is available
 * Usage: withFeature("EXPORT_PDF", handler)
 */
export function withFeature(featureKey: string) {
  return (handler: (req: NextRequest, context: FeatureContext) => Promise<NextResponse>) => {
    return async (req: NextRequest): Promise<NextResponse> => {
      const orgId = await getOrgIdFromRequest(req)
      if (!orgId) {
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "Organization not found" },
          { status: 401 }
        )
      }

      try {
        await featureGateService.assertFeature(orgId, featureKey)
        return handler(req, { orgId })
      } catch (error) {
        if (error instanceof FeatureNotAvailableError) {
          return NextResponse.json(error.toJSON(), { status: 403 })
        }
        throw error
      }
    }
  }
}

/**
 * Create a middleware that checks a limit without consuming
 * Usage: withLimit("EXPORT_PDF", handler)
 */
export function withLimit(featureKey: string) {
  return (handler: (req: NextRequest, context: FeatureContext) => Promise<NextResponse>) => {
    return async (req: NextRequest): Promise<NextResponse> => {
      const orgId = await getOrgIdFromRequest(req)
      if (!orgId) {
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "Organization not found" },
          { status: 401 }
        )
      }

      const limit = await featureGateService.getLimit(orgId, featureKey)
      const usage = await featureGateService.getAllEntitlements(orgId)

      if (limit !== null) {
        const used = usage.usage[featureKey] ?? 0
        if (used >= limit) {
          return NextResponse.json(
            {
              error: "LIMIT_REACHED",
              feature: featureKey,
              limit,
              used,
              reset_at: usage.resetAt[featureKey]?.toISOString() ?? null,
              upgrade_url: "/billing/upgrade"
            },
            { status: 402 }
          )
        }
      }

      return handler(req, { orgId })
    }
  }
}

/**
 * Create a middleware that checks AND consumes a quota
 * Usage: consumeFeature("EXPORT_PDF", handler)
 */
export function consumeFeature(featureKey: string) {
  return (handler: (req: NextRequest, context: FeatureContext) => Promise<NextResponse>) => {
    return async (req: NextRequest): Promise<NextResponse> => {
      const orgId = await getOrgIdFromRequest(req)
      if (!orgId) {
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "Organization not found" },
          { status: 401 }
        )
      }

      const result = await featureGateService.consume(orgId, featureKey)

      if (!result.success) {
        return NextResponse.json(
          {
            error: result.error,
            feature: result.feature,
            limit: result.limit,
            used: result.used,
            reset_at: result.resetAt?.toISOString() ?? null,
            upgrade_url: "/billing/upgrade"
          },
          { status: 402 }
        )
      }

      // Attach consumption result to request for handler use
      const reqHeaders = new Headers(req.headers)
      reqHeaders.set("x-entitlement-consumed", JSON.stringify(result))

      return handler(req, { orgId })
    }
  }
}

// ============================================
// Express-style Middleware (for non-Next.js)
// ============================================

/**
 * Express-style requireFeature middleware
 */
export function requireFeature(featureKey: string) {
  return async (req: any, res: any, next: any) => {
    const orgId = req.orgId || req.params?.orgId
    if (!orgId) {
      return res.status(401).json({ error: "UNAUTHORIZED" })
    }

    try {
      await featureGateService.assertFeature(orgId, featureKey)
      next()
    } catch (error) {
      if (error instanceof FeatureNotAvailableError) {
        return res.status(403).json(error.toJSON())
      }
      next(error)
    }
  }
}

/**
 * Express-style consumeFeature middleware
 */
export function consumeFeatureExpress(featureKey: string) {
  return async (req: any, res: any, next: any) => {
    const orgId = req.orgId || req.params?.orgId
    if (!orgId) {
      return res.status(401).json({ error: "UNAUTHORIZED" })
    }

    const result = await featureGateService.consume(orgId, featureKey)

    if (!result.success) {
      return res.status(402).json({
        error: result.error,
        feature: result.feature,
        limit: result.limit,
        used: result.used,
        reset_at: result.resetAt?.toISOString() ?? null
      })
    }

    // Attach result to request for handlers
    req.entitlementConsumption = result
    next()
  }
}

// ============================================
// Error Handler
// ============================================

/**
 * Handle entitlement errors in API routes
 */
export function handleEntitlementError(error: unknown): NextResponse {
  if (error instanceof FeatureNotAvailableError) {
    return NextResponse.json(error.toJSON(), { status: 403 })
  }
  if (error instanceof LimitReachedError) {
    return NextResponse.json(error.toJSON(), { status: 402 })
  }
  if (error instanceof SubscriptionExpiredError) {
    return NextResponse.json(error.toJSON(), { status: 402 })
  }
  
  // Re-throw unknown errors
  throw error
}