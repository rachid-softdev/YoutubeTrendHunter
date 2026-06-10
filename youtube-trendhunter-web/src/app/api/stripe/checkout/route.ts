import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkoutSchema } from "@/lib/schemas";
import { withRateLimit } from "@/lib/rate-limit";
import { stripeAdapter } from "@/lib/payment/stripe-adapter";
import { ValidationError, UnauthorizedError, NotFoundError, InternalError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, "auth");
  if (rateLimitResponse) return rateLimitResponse;

  const session = await auth();
  if (!session?.user?.id) {
    return UnauthorizedError();
  }

  const body = await req.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return ValidationError("Price ID invalide", parsed.error.flatten());
  }
  const { priceId } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, email: true, name: true },
  });

  if (!user) {
    return NotFoundError("Utilisateur");
  }

  try {
    const result = await stripeAdapter.createCheckoutSession({
      priceId,
      userId: session.user.id,
      userEmail: user.email!,
      userName: user.name ?? undefined,
      stripeCustomerId: user.stripeCustomerId ?? undefined,
      successUrl: `${process.env.NEXTAUTH_URL}/dashboard?success=true`,
      cancelUrl: `${process.env.NEXTAUTH_URL}/pricing`,
    });

    return Response.json({ url: result.url });
  } catch (err) {
    console.error("[Checkout] Failed:", err);
    return InternalError();
  }
}
