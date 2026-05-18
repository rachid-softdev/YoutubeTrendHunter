import { NextRequest } from "next/server"
import type { Session } from "next-auth"

export function createMockRequest(options: {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  query?: Record<string, string>
  user?: Session["user"]
} = {}): NextRequest {
  const { method = "GET", headers = {}, body, query = {}, user } = options

  const url = new URL("http://localhost:3000/api/test")
  Object.entries(query).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const req = new NextRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  return req
}

export function createMockSession(user: Session["user"]): Session {
  return {
    user: {
      ...user,
      id: user?.id || "test-user-id",
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }
}

export function createTestUser(overrides: Partial<{
  id: string
  email: string
  name: string
  plan: string
}> = {}) {
  return {
    id: overrides.id || "test-user-id",
    email: overrides.email || "test@example.com",
    name: overrides.name || "Test User",
    plan: overrides.plan || "FREE",
  }
}