import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"

export async function DELETE() {
  const session = await auth()

  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { subscription: true }
    })

    if (!user) {
      return new NextResponse("User not found", { status: 404 })
    }

    // Cancel Stripe subscription if exists
    if (user.subscription?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.subscription.stripeSubscriptionId)
      } catch (error) {
        console.error("Failed to cancel Stripe subscription:", error)
        // We continue even if Stripe cancellation fails, as we want to allow account deletion
      }
    }

    // Delete user from database (Cascade will handle the rest)
    await prisma.user.delete({
      where: { id: user.id },
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("Error deleting user:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
