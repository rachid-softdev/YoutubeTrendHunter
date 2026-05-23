import { describe, it, expect } from "vitest";
import { trendsRefreshSchema, extensionAuthSchema } from "@/lib/schemas";

describe("trendsRefreshSchema", () => {
  it("accepts empty object", () => {
    const result = trendsRefreshSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid niche slug", () => {
    const result = trendsRefreshSchema.safeParse({ nicheSlug: "tech-ia" });
    expect(result.success).toBe(true);
  });

  it("accepts niche slug with hyphens", () => {
    const result = trendsRefreshSchema.safeParse({ nicheSlug: "crypto-trading-2024" });
    expect(result.success).toBe(true);
  });

  it("accepts empty niche slug", () => {
    // Zod string() allows empty strings by default
    const result = trendsRefreshSchema.safeParse({ nicheSlug: "" });
    expect(result.success).toBe(true);
  });
});

describe("extensionAuthSchema", () => {
  it("accepts empty object", () => {
    const result = extensionAuthSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts name field", () => {
    const result = extensionAuthSchema.safeParse({ name: "Chrome Extension" });
    expect(result.success).toBe(true);
  });

  it("accepts name up to 100 characters", () => {
    const result = extensionAuthSchema.safeParse({ name: "a".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("rejects name over 100 characters", () => {
    const result = extensionAuthSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("accepts undefined name", () => {
    const result = extensionAuthSchema.safeParse({ name: undefined });
    expect(result.success).toBe(true);
  });

  it("rejects non-string name", () => {
    const result = extensionAuthSchema.safeParse({ name: 123 });
    expect(result.success).toBe(false);
  });
});
