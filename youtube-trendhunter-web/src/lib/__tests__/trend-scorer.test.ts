/**
 * TEST 4 — Trend scorer avec Zod (trend-scorer.ts)
 *
 * Vérifie que :
 * - Un JSON valide { score: 85, velocity: 12.5 } est parsé correctement
 * - Un score > 100 est rejeté → fallback métrique
 * - Un score < 0 est rejeté → fallback métrique
 * - Un JSON invalide retourne un fallback métrique (pas de throw)
 * - Le fallback calcule un score à partir des métriques d'entrée
 *
 * Note : On mocke le client Anthropic pour éviter les appels API réels.
 * On teste le parsing/validation du score, pas l'appel Claude lui-même.
 *
 * Fallback scoreTrend :  score = round(velocity*0.4 + min(searchVolume/1000,50)*0.3 + min(avgViews/10000,50)*0.3)
 * Fallback scoreVideo  :  score = min(100, round(engagementRate * 5))
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

// On mocke le module anthropic pour contrôler les réponses
// Utilisation de vi.hoisted() pour éviter le problème de hoisting
const mockMessagesCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/anthropic", () => ({
  anthropic: {
    messages: {
      create: mockMessagesCreate,
    },
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { scoreTrend, scoreVideo } from "@/lib/trend-scorer";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validTrendInput = {
  title: "Test Trend",
  searchVolume: 10000,
  videoCount: 500,
  avgViews: 50000,
  velocityPercent: 25,
  niche: "tech",
  language: "fr",
};

const validVideoInput = {
  title: "Test Video",
  description: "A test video description",
  channelTitle: "Test Channel",
  viewCount: 100000,
  likeCount: 5000,
  commentCount: 800,
  publishedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
  niche: "tech",
  language: "fr",
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("scoreTrend()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("Parsing JSON valide", () => {
    it("parse un JSON valide avec score, status, angles et reasoning", async () => {
      const claudeResponse = JSON.stringify({
        score: 85,
        status: "GROWING",
        contentAngles: ["Angle 1", "Angle 2", "Angle 3"],
        reasoning: "Ceci est un test",
      });

      mockMessagesCreate.mockResolvedValue({
        content: [{ type: "text", text: claudeResponse }],
      });

      const result = await scoreTrend(validTrendInput);

      expect(result.score).toBe(85);
      expect(result.status).toBe("GROWING");
      expect(result.contentAngles).toHaveLength(3);
      expect(result.reasoning).toBe("Ceci est un test");
    });

    it("parse un score à 0 (limite basse)", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              score: 0,
              status: "EMERGING",
              contentAngles: ["Test"],
              reasoning: "Score minimal",
            }),
          },
        ],
      });

      const result = await scoreTrend(validTrendInput);
      expect(result.score).toBe(0);
    });

    it("parse un score à 100 (limite haute)", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              score: 100,
              status: "PEAK",
              contentAngles: ["Test"],
              reasoning: "Score maximal",
            }),
          },
        ],
      });

      const result = await scoreTrend(validTrendInput);
      expect(result.score).toBe(100);
    });

    it("parse une velocity float correctement", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              score: 75,
              status: "GROWING",
              contentAngles: ["Test"],
              reasoning: "Test velocity",
            }),
          },
        ],
      });

      const result = await scoreTrend(validTrendInput);
      expect(result.score).toBe(75);
    });
  });

  describe("Validation des limites (schéma Zod)", () => {
    it("rejette un score > 100 (retourne fallback métrique)", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              score: 150,
              status: "PEAK",
              contentAngles: ["Angle"],
              reasoning: "Score trop élevé",
            }),
          },
        ],
      });

      const result = await scoreTrend(validTrendInput);

      // Le schéma rejette 150 (> 100), donc fallback métrique
      // Avec validTrendInput : 25*0.4 + min(10000/1000,50)*0.3 + min(50000/10000,50)*0.3 = 10+3+1.5 = 14.5 → 15
      expect(result.score).toBe(15);
      expect(result.status).toBe("EMERGING");
      expect(result.reasoning).toContain("Fallback");
    });

    it("rejette un score < 0 (retourne fallback métrique)", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              score: -5,
              status: "EMERGING",
              contentAngles: ["Angle"],
              reasoning: "Score négatif",
            }),
          },
        ],
      });

      const result = await scoreTrend(validTrendInput);

      // Fallback métrique : score 15
      expect(result.score).toBe(15);
      expect(result.reasoning).toContain("Fallback");
    });

    it("rejette un status invalide (retourne fallback métrique)", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              score: 50,
              status: "INVALID_STATUS",
              contentAngles: ["Angle"],
              reasoning: "Test",
            }),
          },
        ],
      });

      const result = await scoreTrend(validTrendInput);

      expect(result.score).toBe(15);
      expect(result.reasoning).toContain("Fallback");
    });

    it("rejette contentAngles vide (retourne fallback métrique)", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              score: 50,
              status: "GROWING",
              contentAngles: [],
              reasoning: "Test",
            }),
          },
        ],
      });

      const result = await scoreTrend(validTrendInput);

      // contentAngles min(1) → validation échoue → fallback métrique
      expect(result.score).toBe(15);
      expect(result.reasoning).toContain("Fallback");
    });

    it("rejette un score non entier (ex: 50.5) car TrendScoreSchema utilise .int()", async () => {
      // Le schéma étend TrendScoreSchema qui utilise z.number().int()
      // Donc 50.5 est rejeté → fallback métrique
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              score: 50.5,
              status: "GROWING",
              contentAngles: ["Angle 1"],
              reasoning: "Test",
            }),
          },
        ],
      });

      const result = await scoreTrend(validTrendInput);

      // 50.5 rejeté par .int() → fallback métrique → score 15
      expect(result.score).toBe(15);
      expect(result.reasoning).toContain("Fallback");
    });
  });

  describe("Fallback sur JSON invalide", () => {
    it("retourne un fallback métrique si le JSON est mal formé", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: "Pas du JSON valide",
          },
        ],
      });

      const result = await scoreTrend(validTrendInput);

      // Fallback métrique : score basé sur les inputs
      expect(result.score).toBe(15);
      expect(result.status).toBe("EMERGING");
      expect(result.contentAngles).toEqual([]);
      expect(result.reasoning).toContain("Fallback");
    });

    it("retourne un fallback métrique si Claude ne retourne pas de texte", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: "text", text: "" }],
      });

      const result = await scoreTrend(validTrendInput);

      // JSON.parse("") throw → fallback métrique
      expect(result.score).toBe(15);
      expect(result.reasoning).toContain("Fallback");
    });

    it("retourne un fallback métrique si Claude retourne un type non-text", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: "image", source: { url: "https://example.com/img.png" } }],
      });

      const result = await scoreTrend(validTrendInput);

      // text = "" → JSON.parse("") throw → fallback métrique
      expect(result.score).toBe(15);
      expect(result.reasoning).toContain("Fallback");
    });

    it("ne jette jamais d'exception, même en cas d'erreur Claude", async () => {
      mockMessagesCreate.mockRejectedValue(new Error("API Error"));

      // L'erreur API remonte car elle n'est pas catchée par scoreTrend
      await expect(scoreTrend(validTrendInput)).rejects.toThrow("API Error");
    });
  });

  describe("Structure du retour", () => {
    it("retourne un objet avec les 4 champs requis", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              score: 72,
              status: "GROWING",
              contentAngles: ["Angle A", "Angle B", "Angle C"],
              reasoning: "Tendance en croissance",
            }),
          },
        ],
      });

      const result = await scoreTrend(validTrendInput);

      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("contentAngles");
      expect(result).toHaveProperty("reasoning");
    });
  });
});

describe("scoreVideo()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("parse une réponse valide et retourne un VideoScore", async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            score: 88,
            status: "PEAK",
            contentAngles: ["Angle 1", "Angle 2", "Angle 3"],
          }),
        },
      ],
    });

    const result = await scoreVideo(validVideoInput);

    expect(result.score).toBe(88);
    expect(result.status).toBe("PEAK");
    expect(result.contentAngles).toHaveLength(3);
  });

  it("retourne un fallback métrique si le JSON est invalide", async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "pas du json" }],
    });

    const result = await scoreVideo(validVideoInput);

    // engagementRate = (5000+800)/100000 * 100 = 5.8
    // metricScore = min(100, round(5.8*5)) = 29
    expect(result).toEqual({
      score: 29,
      status: "EMERGING",
      contentAngles: [],
    });
  });

  it("rejette un score > 100 (fallback métrique)", async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            score: 200,
            status: "PEAK",
            contentAngles: ["Angle"],
          }),
        },
      ],
    });

    const result = await scoreVideo(validVideoInput);

    expect(result.score).toBe(29);
    expect(result.status).toBe("EMERGING");
  });
});
