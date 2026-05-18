import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
  checkoutSchema,
  trendsQuerySchema,
  alertCreateSchema,
  alertUpdateSchema,
  deleteAccountSchema,
  extensionAnalyzeSchema,
} from "@/lib/schemas"

describe("Zod Schemas", () => {
  describe("checkoutSchema", () => {
    it("accepts valid priceId", () => {
      expect(checkoutSchema.safeParse({ priceId: "price_123" }).success).toBe(true)
    })
    it("rejects missing priceId", () => {
      expect(checkoutSchema.safeParse({}).success).toBe(false)
    })
    it("rejects empty priceId", () => {
      expect(checkoutSchema.safeParse({ priceId: "" }).success).toBe(false)
    })
  })

  describe("trendsQuerySchema", () => {
    it("accepts valid niche slug", () => {
      expect(trendsQuerySchema.safeParse({ niche: "tech-ia" }).success).toBe(true)
    })
    it("rejects empty niche", () => {
      expect(trendsQuerySchema.safeParse({ niche: "" }).success).toBe(false)
    })
  })

  describe("alertCreateSchema", () => {
    it("accepts valid alert with defaults", () => {
      const result = alertCreateSchema.safeParse({ type: "SCORE_THRESHOLD" })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.threshold).toBe(70)
        expect(result.data.channel).toBe("EMAIL")
      }
    })
    it("accepts custom threshold", () => {
      expect(alertCreateSchema.safeParse({ type: "SPIKE", threshold: 85 }).success).toBe(true)
    })
    it("rejects threshold below 0", () => {
      expect(alertCreateSchema.safeParse({ type: "SCORE_THRESHOLD", threshold: -1 }).success).toBe(false)
    })
    it("rejects invalid type", () => {
      expect(alertCreateSchema.safeParse({ type: "INVALID" }).success).toBe(false)
    })
  })

  describe("alertUpdateSchema", () => {
    it("accepts partial update", () => {
      expect(alertUpdateSchema.safeParse({ threshold: 50 }).success).toBe(true)
    })
    it("accepts empty object", () => {
      expect(alertUpdateSchema.safeParse({}).success).toBe(true)
    })
  })

  describe("deleteAccountSchema", () => {
    it("accepts confirm: true", () => {
      expect(deleteAccountSchema.safeParse({ confirm: true }).success).toBe(true)
    })
    it("rejects confirm: false", () => {
      expect(deleteAccountSchema.safeParse({ confirm: false }).success).toBe(false)
    })
    it("rejects empty body", () => {
      expect(deleteAccountSchema.safeParse({}).success).toBe(false)
    })
  })

  describe("extensionAnalyzeSchema", () => {
    it("accepts valid videoId", () => {
      expect(extensionAnalyzeSchema.safeParse({ videoId: "dQw4w9WgXcQ" }).success).toBe(true)
    })
    it("rejects empty videoId", () => {
      expect(extensionAnalyzeSchema.safeParse({ videoId: "" }).success).toBe(false)
    })
  })
})
