/**
 * Stripe Webhook — delegates to StripeAdapter for processing.
 */
import { NextRequest, NextResponse } from "next/server";
import { stripeAdapter } from "@/lib/payment/stripe-adapter";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Signature manquante" }, { status: 400 });
  }

  try {
    const result = await stripeAdapter.handleWebhook(body, sig);
    return NextResponse.json({ received: true, handled: result.handled });
  } catch (err) {
    console.error("[Stripe Webhook] Error:", err);
    return NextResponse.json({ error: "Webhook invalide" }, { status: 400 });
  }
}
