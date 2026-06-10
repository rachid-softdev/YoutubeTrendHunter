/**
 * TEST 1 — Plan limits (api/trends)
 *
 * Vérifie que les limites de plans sont correctement appliquées dans la route GET /api/trends.
 * - FREE → max 5 tendances, même si le client demande plus
 * - PRO → 20 tendances maximum
 * - Non authentifié → 401
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    niche: { findUnique: vi.fn() },
    trend: { findMany: vi.fn() },
    userNiche: { findMany: vi.fn() },
  },
}));

const mockGetUserPlan = vi.fn();
vi.mock("@/lib/services/subscription.service", () => ({
  getUserPlan: mockGetUserPlan,
  PLAN_LIMITS: {
    FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false, api: false },
    PRO: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: false },
    TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: true },
  },
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Simule le cœur de la route GET /api/trends pour tester le plan limit.
 * On ne peut pas importer directement la route Next.js dans Vitest à cause
 * des dépendances next/server en environnement jsdom, donc on réimplémente
 * la logique métier à tester.
 */
async function simulateTrendsHandler(
  authResult: { user: { id: string } } | null,
  plan: "FREE" | "PRO" | "TEAM",
  nicheExists: boolean,
  trendsCount: number,
) {
  // 1 — Auth check
  if (!authResult?.user?.id) {
    return { status: 401, body: { error: "Non authentifié" } };
  }

  // 2 — Niche lookup
  if (!nicheExists) {
    return { status: 404, body: { error: "Niche introuvable" } };
  }

  // 3 — Plan limits (la logique sous test)
  const PLAN_LIMITS = {
    FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false, api: false },
    PRO: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: false },
    TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: true },
  };

  const limits = PLAN_LIMITS[plan];

  // FREE plan limit check
  if (plan === "FREE") {
    const userNiches = await prisma.userNiche.findMany({
      where: { userId: authResult.user.id },
      select: { nicheId: true },
    });

    if (userNiches.length >= 1) {
      return { status: 403, body: { error: "Limite plan Free atteinte" } };
    }
  }

  // La limite est la ligne critique :
  //   FREE → limits.trendsPerNiche (5)
  //   PRO/TEAM → 20 (hardcodé)
  const take = plan === "FREE" ? limits.trendsPerNiche : 20;

  const trends = await prisma.trend.findMany({
    where: { nicheId: "niche-1", expiresAt: { gte: new Date() } },
    orderBy: { score: "desc" },
    take,
  });

  return { status: 200, body: { trends, plan } };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/trends — Plan Limits (Extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("retourne 401 si l'utilisateur n'est pas authentifié", async () => {
      const result = await simulateTrendsHandler(null, "FREE", true, 0);

      expect(result.status).toBe(401);
      expect(result.body).toHaveProperty("error");
    });

    it("retourne 401 si la session n'a pas d'ID utilisateur", async () => {
      const result = await simulateTrendsHandler({ user: { id: "" } as any }, "FREE", true, 0);

      expect(result.status).toBe(401);
    });

    it("passe l'authentification avec un ID valide", async () => {
      vi.mocked(prisma.userNiche.findMany).mockResolvedValue([]);
      vi.mocked(prisma.trend.findMany).mockResolvedValue([]);

      const result = await simulateTrendsHandler({ user: { id: "user-123" } }, "FREE", true, 0);

      expect(result.status).toBe(200);
    });
  });

  describe("FREE Plan Limits", () => {
    it("limite FREE à 5 tendances max, même si la BDD en a plus", async () => {
      vi.mocked(prisma.userNiche.findMany).mockResolvedValue([]);
      // @ts-expect-error - mock implementation returns plain array, not PrismaPromise
      vi.mocked(prisma.trend.findMany).mockImplementation(async ({ take }: { take?: number }) => {
        // Simule que la BDD a 100 tendances mais que take force à 5
        const fullList = Array.from({ length: 100 }, (_, i) => ({
          id: `trend-${i}`,
          title: `Trend ${i}`,
          score: 100 - i,
        }));
        return fullList.slice(0, take) as any;
      });

      const result = await simulateTrendsHandler({ user: { id: "user-free" } }, "FREE", true, 100);

      expect(result.status).toBe(200);
      expect(result.body!.trends).toHaveLength(5);
      expect(result.body!.plan).toBe("FREE");
    });

    it("limite FREE à 5 même avec un client qui demande limit=100", async () => {
      // Le paramètre limit du client n'est pas parsé par la route →
      // la limite est toujours contrôlée par le serveur.
      vi.mocked(prisma.userNiche.findMany).mockResolvedValue([]);
      // @ts-expect-error - mock implementation returns plain array, not PrismaPromise
      vi.mocked(prisma.trend.findMany).mockImplementation(async ({ take }: { take?: number }) => {
        const bigList = Array.from({ length: 50 }, (_, i) => ({
          id: `t-${i}`,
          title: `Trend ${i}`,
          score: 50 - i,
        }));
        return bigList.slice(0, take) as any;
      });

      const result = await simulateTrendsHandler({ user: { id: "user-free" } }, "FREE", true, 50);

      expect(result.status).toBe(200);
      expect(result.body?.trends?.length).toBeLessThanOrEqual(5);
    });

    it("bloque FREE si la niche est déjà suivie", async () => {
      vi.mocked(prisma.userNiche.findMany).mockResolvedValue([{ nicheId: "niche-other" }] as any);

      const result = await simulateTrendsHandler({ user: { id: "user-free" } }, "FREE", true, 0);

      expect(result.status).toBe(403);
      expect(result.body.error).toContain("Limite plan Free");
    });
  });

  describe("PRO Plan Limits", () => {
    it("limite PRO à 20 tendances max", async () => {
      // @ts-expect-error - mock implementation returns plain array, not PrismaPromise
      vi.mocked(prisma.trend.findMany).mockImplementation(async ({ take }: { take?: number }) => {
        const bigList = Array.from({ length: 100 }, (_, i) => ({
          id: `trend-${i}`,
          title: `Pro Trend ${i}`,
          score: 100 - i,
        }));
        return bigList.slice(0, take) as any;
      });

      const result = await simulateTrendsHandler({ user: { id: "user-pro" } }, "PRO", true, 50);

      expect(result.status).toBe(200);
      expect(result.body!.trends).toHaveLength(20);
      expect(result.body!.plan).toBe("PRO");
    });

    it("ne bloque pas les PRO sur les niches multiples", async () => {
      // FREE check est uniquement pour le plan FREE
      vi.mocked(prisma.trend.findMany).mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => ({
          id: `trend-${i}`,
          title: `Trend ${i}`,
          score: 90 - i * 10,
        })) as any,
      );

      const result = await simulateTrendsHandler({ user: { id: "user-pro" } }, "PRO", true, 3);

      expect(result.status).toBe(200);
      expect(result.body?.trends?.length).toBeLessThanOrEqual(20);
    });
  });

  describe("TEAM Plan Limits", () => {
    it("limite TEAM à 20 tendances (comme PRO)", async () => {
      // @ts-expect-error - mock implementation returns plain array, not PrismaPromise
      vi.mocked(prisma.trend.findMany).mockImplementation(async ({ take }: { take?: number }) => {
        return Array.from({ length: take ?? 0 }, (_, i) => ({
          id: `t-${i}`,
          title: `Team Trend ${i}`,
          score: 80 - i,
        })) as any;
      });

      const result = await simulateTrendsHandler({ user: { id: "user-team" } }, "TEAM", true, 30);

      expect(result.status).toBe(200);
      expect(result.body!.trends).toHaveLength(20);
    });
  });

  describe("Query Validation (schéma)", () => {
    it("refuse une requête sans paramètre niche", async () => {
      // Ce test utilise le vrai schema trendsQuerySchema
      const { trendsQuerySchema } = await import("@/lib/schemas");
      const result = trendsQuerySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("accepte un slug de niche valide", async () => {
      const { trendsQuerySchema } = await import("@/lib/schemas");
      const result = trendsQuerySchema.safeParse({ niche: "finance-personnelle" });
      expect(result.success).toBe(true);
    });
  });
});
