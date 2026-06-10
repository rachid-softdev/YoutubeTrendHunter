import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/types";

function makeError(status: number, message: string, code: string, details?: unknown): NextResponse {
  const body: ApiError = { error: message, code };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}

/** 400 Bad Request — validation failure */
export function ValidationError(message = "Données invalides", details?: unknown) {
  return makeError(400, message, "VALIDATION_ERROR", details);
}

/** 401 Unauthorized — missing or invalid authentication */
export function UnauthorizedError(message = "Non authentifié") {
  return makeError(401, message, "UNAUTHORIZED");
}

/** 403 Forbidden — authenticated but not allowed */
export function ForbiddenError(message = "Accès interdit") {
  return makeError(403, message, "FORBIDDEN");
}

/** 404 Not Found — resource does not exist */
export function NotFoundError(resource = "Ressource") {
  return makeError(404, `${resource} introuvable`, "NOT_FOUND");
}

/** 429 Too Many Requests — rate limit exceeded */
export function RateLimitError(retryAfter?: number) {
  return makeError(
    429,
    "Trop de requêtes. Réessayez plus tard.",
    "RATE_LIMIT",
    retryAfter ? { retryAfter } : undefined,
  );
}

/** 500 Internal Server Error — unexpected failure */
export function InternalError(message = "Erreur interne") {
  return makeError(500, message, "INTERNAL_ERROR");
}
