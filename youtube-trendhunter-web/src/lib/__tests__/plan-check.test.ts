import { describe, it, expect } from "vitest";
import { PLAN_LIMITS } from "@/lib/services/subscription.service";

describe("PLAN_LIMITS", () => {
  it("FREE plan has 1 niche limit", () => {
    expect(PLAN_LIMITS.FREE.niches).toBe(1);
  });

  it("FREE plan has 5 trends per niche", () => {
    expect(PLAN_LIMITS.FREE.trendsPerNiche).toBe(5);
  });

  it("FREE plan cannot export", () => {
    expect(PLAN_LIMITS.FREE.export).toBe(false);
  });

  it("FREE plan cannot create alerts", () => {
    expect(PLAN_LIMITS.FREE.alerts).toBe(false);
  });

  it("PRO plan has unlimited niches (-1 = unlimited)", () => {
    expect(PLAN_LIMITS.PRO.niches).toBe(-1);
  });

  it("PRO plan has unlimited trends (-1 = unlimited)", () => {
    expect(PLAN_LIMITS.PRO.trendsPerNiche).toBe(-1);
  });

  it("PRO plan can export", () => {
    expect(PLAN_LIMITS.PRO.export).toBe(true);
  });

  it("PRO plan can create alerts", () => {
    expect(PLAN_LIMITS.PRO.alerts).toBe(true);
  });

  it("TEAM plan inherits PRO capabilities", () => {
    expect(PLAN_LIMITS.TEAM.alerts).toBe(true);
    expect(PLAN_LIMITS.TEAM.export).toBe(true);
    expect(PLAN_LIMITS.TEAM.niches).toBe(-1);
  });
});
