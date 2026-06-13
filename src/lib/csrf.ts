import { NextRequest } from "next/server"

export function validateOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin")
  const referer = req.headers.get("referer")
  const allowedUrl = process.env.NEXTAUTH_URL

  if (!allowedUrl) return true

  if (origin && !origin.startsWith(allowedUrl)) return false
  if (referer && !referer.startsWith(allowedUrl)) return false

  return true
}
