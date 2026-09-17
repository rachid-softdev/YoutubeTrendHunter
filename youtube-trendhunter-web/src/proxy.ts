import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import { auth } from "@/lib/auth";

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const path = request.nextUrl.pathname;

  // Dev-only routes: block /dev/* in production
  if (process.env.NODE_ENV === "production" && (path === "/dev" || path.startsWith("/dev/"))) {
    return NextResponse.rewrite(new URL("/404", request.url));
  }

  // === Auth protection ===
  const session = await auth();
  const isLoggedIn = !!session?.user;

  const protectedPaths = [
    "/dashboard",
    "/home",
    "/my-niches",
    "/alerts",
    "/billing",
    "/settings",
    "/admin",
  ];

  const isProtected = protectedPaths.some((p) => path === p || path.startsWith(`${p}/`));
  const isAuthPage = path === "/login";

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/home", request.nextUrl));
  }

  // === Diagnostic headers ===
  const start = Date.now();
  const requestId = crypto.randomUUID();

  const response = NextResponse.next();
  response.headers.set("X-Request-ID", requestId);

  event.waitUntil(
    Promise.resolve().then(() => {
      const duration = Date.now() - start;
      response.headers.set("X-Duration", String(duration));
      console.warn(
        JSON.stringify({
          type: "request_summary",
          method: request.method,
          path,
          duration,
          requestId,
        }),
      );
    }),
  );

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.ico$).*)"],
};
