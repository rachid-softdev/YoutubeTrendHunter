import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"

// Mock dependencies before importing
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    niche: {
      findUnique: vi.fn(),
    },
    trend: {
      findMany: vi.fn(),
    },
    userNiche: {
      count: vi.fn(),
    },
  },
}))

vi.mock("@/lib/plan-check", () => ({
  getUserPlan: vi.fn().mockResolvedValue("FREE"),
  PLAN_LIMITS: {
    FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false, api: false },
    PRO: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: false },
    TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: true },
  },
}))

vi.mock("@/lib/redis", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(true),
}))

vi.mock("@/lib/schemas", () => ({
  trendsQuerySchema: {
    safeParse: vi.fn().mockReturnValue({
      success: true,
      data: { niche: "tech" },
    }),
  },
}))

describe("GET /api/trends", () => {
  beforeAll(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it("should return 401 when user is not authenticated", async () => {
    const { auth } = await import("@/lib/auth")
    vi.mocked(auth).mockResolvedValue(null)

    const { GET } = await import("../trends/route")
    const req = new Request("http://localhost:3000/api/trends?niche=tech")
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it("should return 400 when niche is missing", async () => {
    const { auth } = await import("@/lib/auth")
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-123" },
    } as any)

    const { GET } = await import("../trends/route")
    const { safeParse } = await import("@/lib/schemas")
    vi.mocked(safeParse).mockReturnValue({ success: false })

    const req = new Request("http://localhost:3000/api/trends")
    const res = await GET(req)

    expect(res.status).toBe(400)
  })
})