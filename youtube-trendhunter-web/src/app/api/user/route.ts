import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { deleteAccountSchema } from "@/lib/schemas";
import { withRateLimit } from "@/lib/rate-limit";
import { UnauthorizedError, NotFoundError, ValidationError, InternalError } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        subscription: {
          select: { plan: true, status: true, stripeSubscriptionId: true },
        },
        _count: {
          select: {
            alerts: true,
            apiTokens: true,
            watchedNiches: true,
          },
        },
      },
    });

    if (!user) return NotFoundError("Utilisateur");

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    return InternalError();
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

  try {
    const body = await req.json();
    const { name } = body;

    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return ValidationError("Le nom est requis");
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { ...(name !== undefined && { name }) },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error updating user:", error);
    return InternalError();
  }
}

export async function DELETE(req: NextRequest) {
  // Rate limit
  const rateLimitResponse = await withRateLimit(req, "auth");
  if (rateLimitResponse) return rateLimitResponse;

  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

  // Validate body
  const body = await req.json().catch(() => ({}));
  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return ValidationError("Confirmation requise. Envoyez { confirm: true }");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { subscription: true },
    });

    if (!user) return NotFoundError("Utilisateur");

    // Cancel Stripe subscription if exists
    if (user.subscription?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.subscription.stripeSubscriptionId);
      } catch (error) {
        console.error("Failed to cancel Stripe subscription:", error);
        return InternalError("Impossible d'annuler votre abonnement. Contactez le support.");
      }
    }

    // Delete user (cascade handles related records)
    await prisma.user.delete({ where: { id: user.id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting user:", error);
    return InternalError();
  }
}
