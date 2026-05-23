import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export default async function middleware(req: NextRequest) {
  const session = await auth();
  const { pathname } = req.nextUrl;

  // Protected routes: redirect to /login if not authenticated
  const protectedPaths = ["/dashboard", "/niches", "/alerts", "/billing", "/settings"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Auth page: redirect to /dashboard if already authenticated
  if (pathname.startsWith("/login") && session) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|file.svg|globe.svg|next.svg|vercel.svg|window.svg).*)",
  ],
};
