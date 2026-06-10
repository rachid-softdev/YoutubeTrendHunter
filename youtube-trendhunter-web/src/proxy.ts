/**
 * Next.js App Router proxy (formerly "middleware").
 *
 * Attaches diagnostic response headers (request ID, duration) and logs
 * a structured request summary for every matched API route.
 *
 * NOTE: The proxy cannot access the downstream route handler's response
 * status code — `NextResponse.next()` always returns 200 at this stage.
 * For accurate RED metrics (rate, errors, duration), call
 * `metrics.record()` from individual route handlers instead.
 *
 * See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 */

import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  const response = NextResponse.next();
  response.headers.set("X-Request-ID", requestId);

  // waitUntil runs after the route handler completes, giving us the
  // real wall-clock duration. Status tracking is intentionally omitted
  // because `response.status` is always 200 (NextResponse.next()).
  event.waitUntil(
    Promise.resolve().then(() => {
      const duration = Date.now() - start;
      response.headers.set("X-Duration", String(duration));

      const url = new URL(request.url);

      console.warn(
        JSON.stringify({
          type: "request_summary",
          method: request.method,
          path: url.pathname,
          status: response.status,
          duration,
          requestId,
        }),
      );
    }),
  );

  return response;
}

// Limit the proxy to API routes only
export const config = {
  matcher: "/api/:path*",
};
