import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extensionAuthSchema } from "@/lib/schemas";
import { createApiToken, listApiTokens } from "@/lib/api-tokens";
import { getUserPlan, PLAN_LIMITS } from "@/lib/services/subscription.service";
import { withRateLimit } from "@/lib/rate-limit";
import { UnauthorizedError, ValidationError, ForbiddenError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  // Rate limiting on token creation
  const rateLimitResponse = await withRateLimit(req, "auth");
  if (rateLimitResponse) return rateLimitResponse;

  const session = await auth();
  if (!session?.user?.id) {
    return UnauthorizedError();
  }

  const body = await req.json().catch(() => ({}));
  const parsed = extensionAuthSchema.safeParse(body);
  if (!parsed.success) {
    return ValidationError("Données invalides");
  }

  // Check plan limits for API access
  const plan = await getUserPlan(session.user.id);
  if (!PLAN_LIMITS[plan]?.api) {
    return ForbiddenError(
      "API non disponible sur votre formule. Passez à Team pour accéder à l'API.",
    );
  }

  const result = await createApiToken(session.user.id, parsed.data.name ?? "Extension Chrome");

  // Le token en clair n'est affiché qu'à la création
  return NextResponse.json({
    token: result.plainText,
    id: result.token.id,
    name: result.token.name,
  });
}

export async function GET(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, "auth");
  if (rateLimitResponse) return rateLimitResponse;

  const session = await auth();
  if (!session?.user?.id) {
    return UnauthorizedError();
  }

  const tokens = await listApiTokens(session.user.id);
  return NextResponse.json({ tokens });
}
