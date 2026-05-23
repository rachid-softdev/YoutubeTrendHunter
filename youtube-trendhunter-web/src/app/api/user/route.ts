import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { deleteAccountSchema } from "@/lib/schemas";
import { withRateLimit } from "@/lib/rate-limit";

export async function DELETE(req: NextRequest) {
  // Rate limit
  const rateLimitResponse = await withRateLimit(req, "auth");
  if (rateLimitResponse) return rateLimitResponse;

  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Validate body
  const body = await req.json().catch(() => ({}));
  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Confirmation requise. Envoyez { confirm: true }" },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { subscription: true },
    });

    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    // Cancel Stripe subscription if exists
    if (user.subscription?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.subscription.stripeSubscriptionId);
      } catch (error) {
        console.error("Failed to cancel Stripe subscription:", error);
        return NextResponse.json(
          { error: "Impossible d'annuler votre abonnement. Contactez le support." },
          { status: 500 },
        );
      }
    }

    // Delete user (cascade handles related records)
    await prisma.user.delete({ where: { id: user.id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting user:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
