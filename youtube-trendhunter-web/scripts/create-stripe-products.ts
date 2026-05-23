const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function createProducts() {
  console.log("Creating Stripe products...");

  const starterMonthly = await stripe.products.create({
    name: "TrendHunter Starter",
    description: "20 trends/month, 5 presets, basic analytics",
  });

  await stripe.prices.create({
    product: starterMonthly.id,
    unit_amount: 800,
    currency: "usd",
    recurring: {
      interval: "month",
    },
    metadata: {
      tier: "starter",
      interval: "monthly",
    },
  });

  console.log(`Created Starter Monthly: ${starterMonthly.id}`);

  const starterYearly = await stripe.products.create({
    name: "TrendHunter Starter (Annual)",
    description: "20 trends/month, 5 presets, basic analytics, billed yearly",
  });

  await stripe.prices.create({
    product: starterYearly.id,
    unit_amount: 8000,
    currency: "usd",
    recurring: {
      interval: "year",
    },
    metadata: {
      tier: "starter",
      interval: "yearly",
    },
  });

  console.log(`Created Starter Yearly: ${starterYearly.id}`);

  const proMonthly = await stripe.products.create({
    name: "TrendHunter Pro",
    description: "300 trends/month, unlimited presets, all modes, advanced analytics",
  });

  await stripe.prices.create({
    product: proMonthly.id,
    unit_amount: 2000,
    currency: "usd",
    recurring: {
      interval: "month",
    },
    metadata: {
      tier: "pro",
      interval: "monthly",
    },
  });

  console.log(`Created Pro Monthly: ${proMonthly.id}`);

  const proYearly = await stripe.products.create({
    name: "TrendHunter Pro (Annual)",
    description: "300 trends/month, unlimited presets, all modes, billed yearly",
  });

  await stripe.prices.create({
    product: proYearly.id,
    unit_amount: 20000,
    currency: "usd",
    recurring: {
      interval: "year",
    },
    metadata: {
      tier: "pro",
      interval: "yearly",
    },
  });

  console.log(`Created Pro Yearly: ${proYearly.id}`);

  console.log("\n✅ All products created!");
  console.log("\nAdd these price IDs to your environment:");
  console.log("- starter_monthly: (find in Stripe dashboard)");
  console.log("- starter_yearly: (find in Stripe dashboard)");
  console.log("- pro_monthly: (find in Stripe dashboard)");
  console.log("- pro_yearly: (find in Stripe dashboard)");
}

createProducts().catch(console.error);
