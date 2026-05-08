import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

async function proxy(req: Request) {
  const session = await auth()
  const isLoggedIn = !!session
  const url = new URL(req.url)
  const isOnDashboard = url.pathname.startsWith("/dashboard") ||
    url.pathname.startsWith("/niches") ||
    url.pathname.startsWith("/alerts") ||
    url.pathname.startsWith("/billing")

  if (isOnDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (isLoggedIn && url.pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  return NextResponse.next()
}

export default proxy

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}