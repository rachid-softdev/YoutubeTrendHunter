import Stripe from "stripe"

let _stripe: Stripe | null = null
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
  _stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia", typescript: true })
  return _stripe
}

export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    const client = _stripe ?? getStripe()
    return Reflect.get(client, prop, client)
  },
})