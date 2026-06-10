/**
 * Re-export shim for backward compatibility.
 *
 * All plan-check logic has been migrated to src/lib/services/subscription.service.ts.
 * This file exists temporarily to prevent import errors during the transition.
 * TODO: Remove this file once all callers are verified pointing to subscription.service.ts
 */
export {
  getUserPlan,
  isOnTrial,
  getTrialDaysRemaining,
  activateTrial,
  PLAN_LIMITS,
} from "@/lib/services/subscription.service";
