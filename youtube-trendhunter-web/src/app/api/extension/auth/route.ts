import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extensionAuthSchema } from "@/lib/schemas";
import { createApiToken, listApiTokens } from "@/lib/api-tokens";
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check";
import { withRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limiting on token creation
  const rateLimitResponse = await withRateLimit(req, "auth");
  if (rateLimitResponse) return rateLimitResponse;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = extensionAuthSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  // Check plan limits for API access
  const plan = await getUserPlan(session.user.id);
  if (!PLAN_LIMITS[plan]?.api) {
    return NextResponse.json(
      { error: "API non disponible sur votre formule. Passez à Team pour accéder à l'API." },
      { status: 403 },
    );
  }

  const result = await createApiToken(
    session.user.id,
    parsed.data.name ?? "Extension Chrome",
  );

  return NextResponse.json({
    token: result.token,
    id: result.id,
    name: result.name,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const tokens = await listApiTokens(session.user.id);
  return NextResponse.json({ tokens });
}
