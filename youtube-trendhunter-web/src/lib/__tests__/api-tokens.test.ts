/**
 * TEST 2 — Token hashing (api-tokens.ts)
 *
 * Vérifie que :
 * - hashToken() produit un SHA-256 de 64 caractères hex
 * - hashToken() est déterministe (même input → même output)
 * - createApiToken() retourne { plainText, token } où token contient le hash
 * - Le plainText n'est pas stocké en BDD
 * - La fonction rejette les userId invalides
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks Prisma (uniquement pour les fonctions qui en ont besoin) ─────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

// On importe les fonctions à tester
import {
  hashToken,
  generateSecureToken,
  parseToken,
  verifyToken,
  createApiToken,
  verifyApiToken,
  revokeApiToken,
  listApiTokens,
  cleanupExpiredTokens,
} from "@/lib/api-tokens";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("api-tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hashToken()", () => {
    it("produit un hash SHA-256 de 64 caractères hexadécimaux", () => {
      const hash = hashToken("test-token-123");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("est déterministe : même entrée → même sortie", () => {
      const input = "mon-token-secret-456";
      const hash1 = hashToken(input);
      const hash2 = hashToken(input);
      expect(hash1).toBe(hash2);
    });

    it("produit des hashs différents pour des entrées différentes", () => {
      const hash1 = hashToken("token-alpha");
      const hash2 = hashToken("token-beta");
      expect(hash1).not.toBe(hash2);
    });

    it("accepte une chaîne vide", () => {
      const hash = hashToken("");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("accepte des tokens longs (> 256 chars)", () => {
      const longInput = "a".repeat(1000);
      const hash = hashToken(longInput);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("generateSecureToken()", () => {
    it("retourne un objet avec raw, hash, et formatted", () => {
      const token = generateSecureToken();

      expect(token).toHaveProperty("raw");
      expect(token).toHaveProperty("hash");
      expect(token).toHaveProperty("formatted");
    });

    it("génère un raw token de 64 caractères hex (32 bytes)", () => {
      const token = generateSecureToken();
      expect(token.raw).toMatch(/^[0-9a-f]{64}$/);
    });

    it("génère un hash SHA-256 du raw", () => {
      const token = generateSecureToken();
      expect(token.hash).toBe(hashToken(token.raw));
    });

    it("formatted commence par th_", () => {
      const token = generateSecureToken();
      expect(token.formatted).toMatch(/^th_[0-9a-f]{64}\.[0-9a-f]{8}$/);
    });

    it("génère des valeurs différentes à chaque appel", () => {
      const t1 = generateSecureToken();
      const t2 = generateSecureToken();
      expect(t1.raw).not.toBe(t2.raw);
      expect(t1.hash).not.toBe(t2.hash);
      expect(t1.formatted).not.toBe(t2.formatted);
    });
  });

  describe("parseToken()", () => {
    it("parse un token formaté correctement", () => {
      const token = generateSecureToken();
      const parsed = parseToken(token.formatted);

      expect(parsed).not.toBeNull();
      expect(parsed!.raw).toBe(token.raw);
      expect(parsed!.hashPrefix).toBe(token.hash.slice(0, 8));
    });

    it("retourne null si le token ne commence pas par th_", () => {
      const result = parseToken("invalid-token");
      expect(result).toBeNull();
    });

    it("retourne null si le token n'a pas de point séparateur", () => {
      const result = parseToken("th_notokenformatted");
      expect(result).toBeNull();
    });

    it("retourne null si le token vide", () => {
      const result = parseToken("");
      expect(result).toBeNull();
    });

    it("retourne null si le token est seulement le préfixe", () => {
      const result = parseToken("th_");
      expect(result).toBeNull();
    });

    it("retourne null si le token a plus d'un point (format invalide)", () => {
      // La fonction split('.') produit 3 parties, mais le format attend
      // exactement 2 parties (raw.hashPrefix)
      const result = parseToken("th_abc.def.ghi");
      expect(result).toBeNull();
    });
  });

  describe("verifyToken()", () => {
    it("vérifie un token valide", () => {
      const token = generateSecureToken();
      const isValid = verifyToken(token.formatted, token.hash);
      expect(isValid).toBe(true);
    });

    it("rejette un token avec un mauvais hash stocké", () => {
      const token = generateSecureToken();
      const wrongHash = hashToken("different-raw");
      const isValid = verifyToken(token.formatted, wrongHash);
      expect(isValid).toBe(false);
    });

    it("rejette un token mal formaté", () => {
      const isValid = verifyToken("invalid", "somehash");
      expect(isValid).toBe(false);
    });

    it("rejette un null token", () => {
      const isValid = verifyToken("", "hash");
      expect(isValid).toBe(false);
    });
  });

  describe("createApiToken()", () => {
    it("crée un token et retourne { plainText, token }", async () => {
      const mockCreated = {
        id: "tok-123",
        token: "stored-hash",
        name: "Mon Token",
        expiresAt: null,
      };
      (prisma.apiToken.create as any).mockResolvedValue(mockCreated);

      const result = await createApiToken("user-123", "Mon Token");

      // Vérifier que le mock a été appelé
      expect(prisma.apiToken.create).toHaveBeenCalled();

      // Résultat devrait être { plainText, token }
      expect(result).toHaveProperty("plainText");
      expect(result).toHaveProperty("token");

      // plainText est le token formaté (th_...)
      expect(typeof result.plainText).toBe("string");
      expect(result.plainText).toMatch(/^th_/);

      // token est l'enregistrement Prisma complet
      expect(result.token).toHaveProperty("id", "tok-123");
      expect(result.token).toHaveProperty("name", "Mon Token");
      expect(result.token).not.toHaveProperty("raw"); // raw n'est jamais stocké
    });

    it("stocke le hash en BDD, pas le plainText", async () => {
      (prisma.apiToken.create as any).mockResolvedValue({ id: "tok-1" });

      await createApiToken("user-456", "Test");

      const createCall = (prisma.apiToken.create as any).mock.calls[0][0];
      const storedToken = createCall.data.token;

      // Le token stocké doit être un hash SHA-256, pas un plainText
      expect(storedToken).toMatch(/^[0-9a-f]{64}$/);
    });

    it("stocke le bon hash en BDD", async () => {
      (prisma.apiToken.create as any).mockImplementation(async (args: any) => {
        return { id: "tok-1", ...args.data };
      });

      const result = await createApiToken("user-789", "CheckHash");
      const createCall = (prisma.apiToken.create as any).mock.calls[0][0];
      const storedHash = createCall.data.token;

      // Le plainText retourné au client doit contenir le raw
      // Le hash stocké doit être SHA-256 du raw
      // On vérifie via parseToken et hashToken
      expect(typeof result.plainText).toBe("string");
      expect(result.plainText).toMatch(/^th_/);

      const parsed = parseToken(result.plainText);
      expect(parsed).not.toBeNull();
      expect(storedHash).toBe(hashToken(parsed!.raw));
    });

    it("stocke le userId dans la BDD", async () => {
      (prisma.apiToken.create as any).mockResolvedValue({ id: "tok-1" });

      await createApiToken("user-to-test", "Test");

      const createCall = (prisma.apiToken.create as any).mock.calls[0][0];
      expect(createCall.data.userId).toBe("user-to-test");
    });

    it("gère un expiresAt optionnel", async () => {
      (prisma.apiToken.create as any).mockResolvedValue({ id: "tok-1" });

      const futureDate = new Date(Date.now() + 86400000);
      await createApiToken("user-1", "Expiring", futureDate);

      const createCall = (prisma.apiToken.create as any).mock.calls[0][0];
      expect(createCall.data.expiresAt).toEqual(futureDate);
    });
  });

  describe("verifyApiToken()", () => {
    it("retourne null pour un token mal formaté", async () => {
      const result = await verifyApiToken("invalid");
      expect(result).toBeNull();
    });

    it("retourne null pour un token inconnu", async () => {
      vi.mocked(prisma.apiToken.findFirst).mockResolvedValue(null);

      const token = generateSecureToken();
      const result = await verifyApiToken(token.formatted);

      expect(result).toBeNull();
      expect(prisma.apiToken.findFirst).toHaveBeenCalled();
    });

    it("retourne les infos user pour un token valide", async () => {
      const token = generateSecureToken();
      const mockApiToken = {
        id: "tok-1",
        token: token.hash,
        user: { id: "user-1", email: "test@test.com", name: "Test" },
      };

      vi.mocked(prisma.apiToken.findFirst).mockResolvedValue(mockApiToken as any);
      vi.mocked(prisma.apiToken.update).mockResolvedValue({} as any);

      const result = await verifyApiToken(token.formatted);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe("user-1");
      expect(result!.tokenId).toBe("tok-1");
    });

    it("met à jour lastUsedAt après vérification", async () => {
      const token = generateSecureToken();
      vi.mocked(prisma.apiToken.findFirst).mockResolvedValue({
        id: "tok-1",
        token: token.hash,
        user: { id: "u-1", email: "a@b.com", name: "A" },
      } as any);
      vi.mocked(prisma.apiToken.update).mockResolvedValue({} as any);

      await verifyApiToken(token.formatted);

      expect(prisma.apiToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tok-1" },
          data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe("revokeApiToken()", () => {
    it("supprime le token et retourne true", async () => {
      vi.mocked(prisma.apiToken.deleteMany).mockResolvedValue({ count: 1 } as any);

      const result = await revokeApiToken("tok-1", "user-1");

      expect(result).toBe(true);
      expect(prisma.apiToken.deleteMany).toHaveBeenCalledWith({
        where: { id: "tok-1", userId: "user-1" },
      });
    });

    it("retourne false si le token n'existe pas", async () => {
      vi.mocked(prisma.apiToken.deleteMany).mockResolvedValue({ count: 0 } as any);

      const result = await revokeApiToken("tok-inexistant", "user-1");

      expect(result).toBe(false);
    });

    it("vérifie que le userId correspond", async () => {
      vi.mocked(prisma.apiToken.deleteMany).mockResolvedValue({ count: 0 } as any);

      await revokeApiToken("tok-1", "wrong-user");

      expect(prisma.apiToken.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "wrong-user" }),
        }),
      );
    });
  });

  describe("listApiTokens()", () => {
    it("retourne la liste des tokens pour un userId", async () => {
      const mockTokens = [
        { id: "tok-1", name: "Token 1", lastUsedAt: null, expiresAt: null, createdAt: new Date() },
        {
          id: "tok-2",
          name: "Token 2",
          lastUsedAt: new Date(),
          expiresAt: null,
          createdAt: new Date(),
        },
      ];
      vi.mocked(prisma.apiToken.findMany).mockResolvedValue(mockTokens as any);

      const result = await listApiTokens("user-1");

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Token 1");
      expect(prisma.apiToken.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
        }),
      );
    });

    it("ne retourne pas le hash du token dans la liste", async () => {
      vi.mocked(prisma.apiToken.findMany).mockResolvedValue([] as any);

      await listApiTokens("user-1");

      const findManyCall = vi.mocked(prisma.apiToken.findMany).mock.calls[0][0];
      const select = findManyCall.select as Record<string, boolean>;
      // Le token (hash) ne doit pas être dans la sélection
      expect(select.token).toBeUndefined();
    });
  });

  describe("cleanupExpiredTokens()", () => {
    it("supprime les tokens expirés", async () => {
      vi.mocked(prisma.apiToken.deleteMany).mockResolvedValue({ count: 3 } as any);

      const result = await cleanupExpiredTokens();

      expect(result).toBe(3);
      expect(prisma.apiToken.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expiresAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );
    });

    it("retourne 0 s'il n'y a pas de tokens expirés", async () => {
      vi.mocked(prisma.apiToken.deleteMany).mockResolvedValue({ count: 0 } as any);

      const result = await cleanupExpiredTokens();

      expect(result).toBe(0);
    });
  });
});
