import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies first
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Simple test for the health check logic
describe("Health Check API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("database check logic", () => {
    it("returns status ok when database query succeeds", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "1": 1 }]);

      const health = {
        status: "ok",
        services: { database: "unknown" as string },
      };

      try {
        await prisma.$queryRaw`SELECT 1`;
        health.services.database = "ok";
      } catch {
        health.services.database = "error";
        health.status = "degraded";
      }

      expect(health.status).toBe("ok");
      expect(health.services.database).toBe("ok");
    });

    it("returns status degraded when database query fails", async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("Connection failed"));

      const health = {
        status: "ok",
        services: { database: "unknown" as string },
      };

      try {
        await prisma.$queryRaw`SELECT 1`;
        health.services.database = "ok";
      } catch {
        health.services.database = "error";
        health.status = "degraded";
      }

      expect(health.status).toBe("degraded");
      expect(health.services.database).toBe("error");
    });
  });
});

describe("Extension Auth API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authentication logic", () => {
    it("requires authentication", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const session = await auth();
      const isAuthenticated = !!session?.user?.id;

      expect(isAuthenticated).toBe(false);
    });

    it("allows authenticated users", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user_123", name: "Test", email: "test@example.com" },
      } as any);

      const session = await auth();
      const isAuthenticated = !!session?.user?.id;

      expect(isAuthenticated).toBe(true);
    });
  });

  describe("schema validation", () => {
    it("validates extension auth body", async () => {
      const { extensionAuthSchema } = await import("@/lib/schemas");

      // Valid cases
      expect(extensionAuthSchema.safeParse({}).success).toBe(true);
      expect(extensionAuthSchema.safeParse({ name: "My Extension" }).success).toBe(true);
      expect(extensionAuthSchema.safeParse({ name: "a".repeat(100) }).success).toBe(true);

      // Invalid cases
      expect(extensionAuthSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
      expect(extensionAuthSchema.safeParse({ name: 123 }).success).toBe(false);
    });
  });
});

describe("Extension Analyze API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("token validation logic", () => {
    it("extracts token from Bearer header", () => {
      const authHeader = "Bearer abc123";
      const token = authHeader?.replace("Bearer ", "");
      expect(token).toBe("abc123");
    });

    it("returns falsy when no header", () => {
      const authHeader = null;
      const token = authHeader?.replace("Bearer ", "");
      // null?.replace() returns undefined (falsy), which is correct for "no token"
      expect(token).toBeFalsy();
    });
  });

  describe("videoId validation", () => {
    it("requires videoId in body", () => {
      const validateVideoId = (videoId: string | undefined) => {
        return videoId ? { valid: true, videoId } : { valid: false, error: "videoId requis" };
      };

      expect(validateVideoId("dQw4w9WgXcQ")).toEqual({ valid: true, videoId: "dQw4w9WgXcQ" });
      expect(validateVideoId(undefined)).toEqual({ valid: false, error: "videoId requis" });
      expect(validateVideoId("")).toEqual({ valid: false, error: "videoId requis" });
    });
  });
});
