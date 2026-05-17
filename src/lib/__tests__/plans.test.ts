import { describe, it, expect } from "vitest"
import { PLANS } from "@/lib/plans"

describe("PLANS", () => {
  it("exports an array with 3 plans", () => {
    expect(Array.isArray(PLANS)).toBe(true)
    expect(PLANS).toHaveLength(3)
  })

  describe("Free plan", () => {
    const free = PLANS[0]

    it("has correct name and price", () => {
      expect(free.name).toBe("Free")
      expect(free.price).toBe("0€")
    })

    it("has correct period", () => {
      expect(free.period).toBe("/mois")
    })

    it("has correct CTA link", () => {
      expect(free.cta).toBe("Commencer gratuit")
      expect(free.href).toBe("/login")
    })

    it("is not marked as popular", () => {
      expect(free.popular).toBe(false)
    })

    it("has 4 features", () => {
      expect(free.features).toHaveLength(4)
      expect(free.features).toContain("1 niche suivie")
      expect(free.features).toContain("5 tendances par niche")
    })
  })

  describe("Pro plan", () => {
    const pro = PLANS[1]

    it("has correct name and price", () => {
      expect(pro.name).toBe("Pro")
      expect(pro.price).toBe("15€")
    })

    it("is marked as popular", () => {
      expect(pro.popular).toBe(true)
    })

    it("has 6 features including unlimited access", () => {
      expect(pro.features).toContain("Toutes les niches")
      expect(pro.features).toContain("Tendances illimitées")
    })

    it("has CTA for plan upgrade", () => {
      expect(pro.cta).toBe("Passer Pro")
      expect(pro.href).toBe("/login?plan=pro")
    })
  })

  describe("Team plan", () => {
    const team = PLANS[2]

    it("has correct name and price", () => {
      expect(team.name).toBe("Team")
      expect(team.price).toBe("39€")
    })

    it("is not marked as popular", () => {
      expect(team.popular).toBe(false)
    })

    it("has CTA for contact", () => {
      expect(team.cta).toBe("Contact commercial")
      expect(team.href).toBe("mailto:contact@trendhunter.app")
    })

    it("includes Pro features plus team features", () => {
      expect(team.features).toContain("Tout Pro")
      expect(team.features).toContain("5 utilisateurs")
      expect(team.features).toContain("API access")
      expect(team.features).toContain("Webhooks")
    })
  })

  it("all plans have required fields", () => {
    for (const plan of PLANS) {
      expect(plan).toHaveProperty("name")
      expect(plan).toHaveProperty("price")
      expect(plan).toHaveProperty("period")
      expect(plan).toHaveProperty("description")
      expect(plan).toHaveProperty("features")
      expect(plan).toHaveProperty("cta")
      expect(plan).toHaveProperty("href")
      expect(typeof plan.popular).toBe("boolean")
    }
  })

  it("all plans have non-empty features", () => {
    for (const plan of PLANS) {
      expect(plan.features.length).toBeGreaterThan(0)
    }
  })
})