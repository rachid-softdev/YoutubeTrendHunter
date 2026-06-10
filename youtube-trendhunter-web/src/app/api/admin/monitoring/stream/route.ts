// ============================================
// Admin: RED Metrics SSE Stream
// GET /api/admin/monitoring/stream
// ============================================

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { metrics } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    const err = error as { status?: number; message?: string };
    return new Response(JSON.stringify({ error: err.message || "Non autorisé" }), {
      status: err.status || 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        try {
          const enriched = metrics.getEnrichedStats();
          const payload = JSON.stringify(enriched);
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch (err) {
          console.error("[SSE] Error sending metrics:", err);
        }
      };

      // Send immediately on connect
      send();

      // Then push an updated snapshot every 5 seconds
      interval = setInterval(send, 5000);

      // Cleanup when the client disconnects
      req.signal.addEventListener("abort", () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
