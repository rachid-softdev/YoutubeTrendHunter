// ============================================
// FeatureGuard Component
// ============================================

"use client"

import { useFeature } from "@/hooks/use-entitlements"
import Link from "next/link"

interface FeatureGuardProps {
  feature: string
  children: React.ReactNode
  fallback?: React.ReactNode
  showUpgradeLink?: boolean
  limit?: string // If checking a limit instead of boolean feature
}

export function FeatureGuard({ 
  feature, 
  children, 
  fallback = null,
  showUpgradeLink = true,
  limit 
}: FeatureGuardProps) {
  const isEnabled = useFeature(feature)
  
  // If checking a limit
  if (limit) {
    const { useLimit } = require("@/hooks/use-entitlements")
    const limitInfo = useLimit(limit)
    
    if (!limitInfo) {
      // Loading state - show children with loading indicator
      return <>{children}</>
    }
    
    if (limitInfo.limit !== null && limitInfo.used >= limitInfo.limit) {
      return (
        <FeatureDisabledFallback 
          feature={feature} 
          showUpgradeLink={showUpgradeLink}
          limitInfo={limitInfo}
        />
      )
    }
    
    return <>{children}</>
  }
  
  // Boolean feature check
  if (!isEnabled) {
    return (
      <FeatureDisabledFallback 
        feature={feature} 
        showUpgradeLink={showUpgradeLink}
      />
    )
  }
  
  return <>{children}</>
}

function FeatureDisabledFallback({ 
  feature, 
  showUpgradeLink,
  limitInfo 
}: { 
  feature: string
  showUpgradeLink: boolean
  limitInfo?: { limit: number | null; used: number; resetAt: string | null }
}) {
  return (
    <div className="relative">
      {showUpgradeLink && (
        <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
            Feature <strong>{feature}</strong> not available on your plan
          </div>
          
          {limitInfo && limitInfo.limit !== null && (
            <div className="text-xs text-slate-500 mb-3">
              Used: {limitInfo.used} / {limitInfo.limit}
              {limitInfo.resetAt && (
                <> (resets {new Date(limitInfo.resetAt).toLocaleDateString()})</>
              )}
            </div>
          )}
          
          <Link 
            href="/billing/upgrade"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            Upgrade to Pro
          </Link>
        </div>
      )}
    </div>
  )
}

// ============================================
// Upgrade Banner Component
// ============================================

interface UpgradeBannerProps {
  title?: string
  message?: string
  feature?: string
}

export function UpgradeBanner({ 
  title = "Unlock More Features",
  message = "Upgrade your plan to access this feature",
  feature
}: UpgradeBannerProps) {
  return (
    <div className="flex items-center justify-between p-4 mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
      <div>
        <h3 className="font-semibold text-blue-900 dark:text-blue-100">
          {title}
        </h3>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          {message}
          {feature && <span className="font-medium"> ({feature})</span>}
        </p>
      </div>
      <Link
        href="/billing/upgrade"
        className="shrink-0 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
      >
        Upgrade
      </Link>
    </div>
  )
}

// ============================================
// Limit Warning Component
// ============================================

interface LimitWarningProps {
  limitKey: string
  showResetDate?: boolean
}

export function LimitWarning({ limitKey, showResetDate = true }: LimitWarningProps) {
  const { useLimit } = require("@/hooks/use-entitlements")
  const limitInfo = useLimit(limitKey)
  
  if (!limitInfo || limitInfo.limit === null) return null
  
  const percentage = limitInfo.limit > 0 
    ? (limitInfo.used / limitInfo.limit) * 100 
    : 0
  
  const isWarning = percentage >= 80
  const isReached = limitInfo.used >= limitInfo.limit
  
  if (!isWarning && !isReached) return null
  
  return (
    <div className={`flex items-center gap-2 text-sm ${
      isReached 
        ? "text-red-600 dark:text-red-400" 
        : "text-amber-600 dark:text-amber-400"
    }`}>
      <span>
        {isReached 
          ? `Limit reached (${limitInfo.used}/${limitInfo.limit})`
          : `Approaching limit (${limitInfo.used}/${limitInfo.limit})`
        }
      </span>
      {showResetDate && limitInfo.resetAt && !isReached && (
        <span className="text-slate-500">
          - resets {new Date(limitInfo.resetAt).toLocaleDateString()}
        </span>
      )}
    </div>
  )
}