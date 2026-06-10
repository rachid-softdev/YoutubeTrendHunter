import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { portalSessionSchema } from "@/lib/schemas";
import { stripeAdapter } from "@/lib/payment/stripe-adapter";
import { withRateLimit } from "@/lib/rate-limit";
import { ValidationError, UnauthorizedError, InternalError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, "auth");
  if (rateLimitResponse) return rateLimitResponse;

  const session = await auth();
  if (!session?.user?.id) {
    return UnauthorizedError();
  }

  const body = await req.json().catch(() => ({}));
  const parsed = portalSessionSchema.safeParse(body);
  if (!parsed.success) {
    return ValidationError("Données invalides", parsed.error.flatten());
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });

  if (!user?.stripeCustomerId) {
    return Response.json({ error: "Aucun abonnement" }, { status: 400 });
  }

  try {
    const result = await stripeAdapter.createPortalSession({
      customerId: user.stripeCustomerId,
      returnUrl: parsed.data.returnUrl ?? `${process.env.NEXTAUTH_URL}/billing`,
    });
    return Response.json({ url: result.url });
  } catch (err) {
    console.error("[Portal] Failed:", err);
    return InternalError();
  }
}
