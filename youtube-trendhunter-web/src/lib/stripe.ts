import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-08-26.dahlia",
  typescript: true,
  timeout: 15000,
  maxNetworkRetries: 3,
});
