import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { checkoutSchema } from "@/lib/schemas"
import { withRateLimit } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  // Rate limit
  const rateLimitResponse = await withRateLimit(req, "auth")
  if (rateLimitResponse) return rateLimitResponse

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = checkoutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Price ID requis" }, { status: 400 })
  }
  const { priceId } = parsed.data

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, email: true, name: true },
  })

  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
  }

  let stripeCustomerId = user.stripeCustomerId

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      name: user.name ?? undefined,
      metadata: { userId: session.user.id },
    })
    stripeCustomerId = customer.id

    await prisma.user.update({
      where: { id: session.user.id },
      data: { stripeCustomerId },
    })
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    billing_address_collection: "required",
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
    subscription_data: {
      metadata: { userId: session.user.id },
    },
  })

  return NextResponse.json({ url: checkoutSession.url })
}
