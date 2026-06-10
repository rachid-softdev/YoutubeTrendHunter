import { describe, it, expect } from "vitest";
import { PLAN_LIMITS } from "../services/subscription.service";

describe("PLAN_LIMITS", () => {
  it("should have correct limits for FREE plan", () => {
    expect(PLAN_LIMITS.FREE.niches).toBe(1);
    expect(PLAN_LIMITS.FREE.trendsPerNiche).toBe(5);
    expect(PLAN_LIMITS.FREE.alerts).toBe(false);
    expect(PLAN_LIMITS.FREE.export).toBe(false);
    expect(PLAN_LIMITS.FREE.api).toBe(false);
  });

  it("should have correct limits for PRO plan", () => {
    expect(PLAN_LIMITS.PRO.niches).toBe(-1);
    expect(PLAN_LIMITS.PRO.trendsPerNiche).toBe(-1);
    expect(PLAN_LIMITS.PRO.alerts).toBe(true);
    expect(PLAN_LIMITS.PRO.export).toBe(true);
    expect(PLAN_LIMITS.PRO.api).toBe(false);
  });

  it("should have correct limits for TEAM plan", () => {
    expect(PLAN_LIMITS.TEAM.niches).toBe(-1);
    expect(PLAN_LIMITS.TEAM.trendsPerNiche).toBe(-1);
    expect(PLAN_LIMITS.TEAM.alerts).toBe(true);
    expect(PLAN_LIMITS.TEAM.export).toBe(true);
    expect(PLAN_LIMITS.TEAM.api).toBe(true);
  });
});

describe("Plan Check Integration", () => {
  it("should have valid PLAN_LIMITS structure", () => {
    // Verify structure
    expect(typeof PLAN_LIMITS.FREE).toBe("object");
    expect(typeof PLAN_LIMITS.PRO).toBe("object");
    expect(typeof PLAN_LIMITS.TEAM).toBe("object");
  });
});
