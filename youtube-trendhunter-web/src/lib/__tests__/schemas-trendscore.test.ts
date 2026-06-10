/**
 * TEST 5 — Schemas Zod (schemas.ts) — TrendScoreSchema
 *
 * Vérifie le schéma TrendScoreSchema exporté depuis schemas.ts.
 *
 * Tests :
 * - { score: 75 } → valide
 * - { score: 150 } → invalide (hors limite)
 * - { score: -5 } → invalide
 * - { score: "abc" } → invalide (type)
 * - { score: 50, velocity: 10, reasoning: "test" } → valide (champs optionnels)
 */

import { describe, it, expect } from "vitest";
import { TrendScoreSchema } from "@/lib/schemas";

// ─── Types ───────────────────────────────────────────────────────────────────

type TrendScore = {
  score: number;
  velocity?: number;
  reasoning?: string;
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TrendScoreSchema (depuis schemas.ts)", () => {
  describe("Validation du champ score", () => {
    it("accepte score = 75 (dans la limite)", () => {
      const result = TrendScoreSchema.safeParse({ score: 75 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.score).toBe(75);
      }
    });

    it("accepte score = 0 (limite minimale)", () => {
      const result = TrendScoreSchema.safeParse({ score: 0 });

      expect(result.success).toBe(true);
    });

    it("accepte score = 100 (limite maximale)", () => {
      const result = TrendScoreSchema.safeParse({ score: 100 });

      expect(result.success).toBe(true);
    });

    it("rejette score = 150 (hors limite max)", () => {
      const result = TrendScoreSchema.safeParse({ score: 150 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it("rejette score = -5 (hors limite min)", () => {
      const result = TrendScoreSchema.safeParse({ score: -5 });

      expect(result.success).toBe(false);
    });

    it("rejette score = 'abc' (mauvais type)", () => {
      const result = TrendScoreSchema.safeParse({ score: "abc" });

      expect(result.success).toBe(false);
    });

    it("rejette score = null", () => {
      const result = TrendScoreSchema.safeParse({ score: null });

      expect(result.success).toBe(false);
    });

    it("rejette score absent (champ requis)", () => {
      const result = TrendScoreSchema.safeParse({});

      expect(result.success).toBe(false);
    });

    it("rejette score = 50.5 (car .int() exige un entier)", () => {
      const result = TrendScoreSchema.safeParse({ score: 50.5 });

      expect(result.success).toBe(false);
    });
  });

  describe("Champs optionnels", () => {
    it("accepte score seul sans velocity ni reasoning", () => {
      const result = TrendScoreSchema.safeParse({ score: 50 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.velocity).toBeUndefined();
        expect(result.data.reasoning).toBeUndefined();
      }
    });

    it("accepte score + velocity", () => {
      const result = TrendScoreSchema.safeParse({ score: 50, velocity: 10 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.velocity).toBe(10);
      }
    });

    it("accepte score + reasoning", () => {
      const result = TrendScoreSchema.safeParse({
        score: 50,
        reasoning: "test",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reasoning).toBe("test");
      }
    });

    it("accepte score + velocity + reasoning (tous les champs)", () => {
      const result = TrendScoreSchema.safeParse({
        score: 50,
        velocity: 10,
        reasoning: "Tendance en hausse",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.score).toBe(50);
        expect(result.data.velocity).toBe(10);
        expect(result.data.reasoning).toBe("Tendance en hausse");
      }
    });

    it("accepte velocity = 0", () => {
      const result = TrendScoreSchema.safeParse({ score: 50, velocity: 0 });

      expect(result.success).toBe(true);
    });

    it("rejette velocity négative (car .min(0))", () => {
      // Le schéma a velocity: z.number().min(0).optional()
      // Donc -5.5 est rejeté
      const result = TrendScoreSchema.safeParse({ score: 50, velocity: -5.5 });

      expect(result.success).toBe(false);
    });

    it("rejette reasoning si ce n'est pas une string", () => {
      const result = TrendScoreSchema.safeParse({
        score: 50,
        reasoning: 123,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("Inférence de type", () => {
    it("le type TrendScore peut être assigné", () => {
      const valid: TrendScore = { score: 85 };
      expect(valid.score).toBe(85);

      const full: TrendScore = {
        score: 90,
        velocity: 12.5,
        reasoning: "Test",
      };
      expect(full.score).toBe(90);
      expect(full.velocity).toBe(12.5);
      expect(full.reasoning).toBe("Test");
    });
  });
});
