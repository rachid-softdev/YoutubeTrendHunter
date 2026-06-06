require('dotenv').config({ path: '.env.local' })
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

async function createProducts() {
  console.log('Stripe key:', process.env.STRIPE_SECRET_KEY ? 'loaded' : 'NOT LOADED')
  
  const starter = await stripe.products.create({
    name: 'TrendHunter Starter',
    description: '20 trends/month, 5 presets, basic analytics',
  })

  const starterPrice = await stripe.prices.create({
    product: starter.id,
    unit_amount: 800,
    currency: 'eur',
    recurring: { interval: 'month' },
  })

  const pro = await stripe.products.create({
    name: 'TrendHunter Pro',
    description: 'Everything + export PDF + priority support',
  })

  const proPrice = await stripe.prices.create({
    product: pro.id,
    unit_amount: 2400,
    currency: 'eur',
    recurring: { interval: 'month' },
  })

  console.log('=== STRIPE PRICE IDs ===')
  console.log(`STRIPE_STARTER_PRICE_ID=${starterPrice.id}`)
  console.log(`STRIPE_PRO_PRICE_ID=${proPrice.id}`)
}

createProducts().catch(console.error)