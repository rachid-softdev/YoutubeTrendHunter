if (!process.env.STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY not found in environment");
  process.exit(1);
}

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = [
  {
    name: "TrendHunter Starter",
    description: "20 trends/week, 5 presets, basic analytics",
    prices: [
      { amount: 800, interval: "month", metadata: { tier: "starter", interval: "monthly" } },
      { amount: 8000, interval: "year", metadata: { tier: "starter", interval: "yearly" } },
    ],
  },
  {
    name: "TrendHunter Pro",
    description: "Unlimited trends, all enhancement modes, advanced analytics",
    prices: [
      { amount: 2000, interval: "month", metadata: { tier: "pro", interval: "monthly" } },
      { amount: 20000, interval: "year", metadata: { tier: "pro", interval: "yearly" } },
    ],
  },
];

async function createProductsAndPrices() {
  console.log("🚀 Creating Stripe products and prices...\n");

  const createdProducts = [];

  for (const productData of PRODUCTS) {
    console.log(`📦 Creating product: ${productData.name}`);

    const product = await stripe.products.create({
      name: productData.name,
      description: productData.description,
    });

    console.log(`   ✓ Product created: ${product.id}`);

    const prices = [];

    for (const priceData of productData.prices) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: priceData.amount,
        currency: "usd",
        recurring: {
          interval: priceData.interval,
        },
        metadata: priceData.metadata,
      });

      console.log(
        `   ✓ Price created: ${price.id} ($${priceData.amount / 100}/${priceData.interval})`,
      );
      prices.push({ id: price.id, amount: priceData.amount, interval: priceData.interval });
    }

    createdProducts.push({ name: productData.name, id: product.id, prices });
    console.log("");
  }

  console.log("✅ All products created successfully!\n");
  console.log("📝 Add these to your environment (.env.local):");
  console.log("");

  for (const p of createdProducts) {
    console.log(`# ${p.name}`);
    for (const price of p.prices) {
      const key = `STRIPE_PRICE_${p.name.toUpperCase().replace(/[^A-Z]/g, "_")}_${price.interval.toUpperCase()}`;
      console.log(`${key}=${price.id}`);
    }
    console.log("");
  }

  console.log("🔗 Configure webhook:");
  console.log(`   URL: https://your-domain.com/api/stripe/webhook`);
  console.log(
    `   Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_succeeded, invoice.payment_failed`,
  );
}

createProductsAndPrices().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
