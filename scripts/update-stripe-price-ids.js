#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Updating Stripe Price IDs...');

try {
  console.log('Fetching price IDs from Stripe...');
  const result = execSync('stripe prices list --limit 20', {
    encoding: 'utf8',
    stdio: 'pipe'
  });

  const priceIds = {};

  console.log('Raw Stripe output length:', result.length);
  console.log('First 500 chars:', result.substring(0, 500));

  try {
    const dataStart = result.indexOf('"data": [');
    const dataEnd = result.indexOf(']', dataStart);

    if (dataStart !== -1 && dataEnd !== -1) {
      const jsonString = result.substring(dataStart + 8, dataEnd + 1);
      const prices = JSON.parse(jsonString);
      console.log('Parsed JSON successfully, prices count:', prices.length);
      for (const price of prices) {
        if (price.id && price.unit_amount) {
          const amount = price.unit_amount;
          const tier = price.metadata?.tier;
          const interval = price.metadata?.interval || price.recurring?.interval;

          console.log(`Processing price: ${price.id}, amount: ${amount}, tier: ${tier}, interval: ${interval}`);

          if (amount === 800) {
            if (!priceIds.starterMonthly && !priceIds.starterYearly) {
              if (interval === 'month') {
                priceIds.starterMonthly = price.id;
                console.log(`Found starter monthly price: ${price.id} ($${amount / 100} USD/month)`);
              } else if (interval === 'year') {
                priceIds.starterYearly = price.id;
                console.log(`Found starter yearly price: ${price.id} ($${amount / 100} USD/year)`);
              }
            }
          } else if (amount === 2000) {
            if (!priceIds.proMonthly && !priceIds.proYearly) {
              if (interval === 'month') {
                priceIds.proMonthly = price.id;
                console.log(`Found pro monthly price: ${price.id} ($${amount / 100} USD/month)`);
              } else if (interval === 'year') {
                priceIds.proYearly = price.id;
                console.log(`Found pro yearly price: ${price.id} ($${amount / 100} USD/year)`);
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.log('JSON parsing failed, using text fallback');
    const lines = result.split('\n');
    for (const line of lines) {
      if (line.includes('price_')) {
        const priceMatch = line.match(/price_[a-zA-Z0-9]+/);
        if (priceMatch) {
          const priceId = priceMatch[0];
          const lineIndex = lines.indexOf(line);
          for (let i = Math.max(0, lineIndex - 2); i <= Math.min(lines.length - 1, lineIndex + 2); i++) {
            const checkLine = lines[i];
            if (checkLine.includes('unit_amount: 800') || (checkLine.includes('800') && checkLine.includes('$8'))) {
              priceIds.starter = priceId;
              console.log(`Found starter price: ${priceId} (8 USD)`);
              break;
            } else if (checkLine.includes('unit_amount: 2000') || (checkLine.includes('2000') && checkLine.includes('$20'))) {
              priceIds.pro = priceId;
              console.log(`Found pro price: ${priceId} (20 USD)`);
              break;
            }
          }
        }
      }
    }
  }

  console.log('Found price IDs:', priceIds);

  const checkoutPath = path.join(process.cwd(), 'src/app/api/stripe/checkout/route.ts');
  let content = fs.readFileSync(checkoutPath, 'utf8');

  const starterPrice = priceIds.starterMonthly || priceIds.starterYearly;
  const proPrice = priceIds.proMonthly || priceIds.proYearly;

  content = content.replace(
    /const STRIPE_PRICES: Record<string, string> = \{[\s\S]*?\};/,
    `const STRIPE_PRICES: Record<string, string> = {
  starter: '${starterPrice || 'price_starter_id_placeholder'}',
  pro: '${proPrice || 'price_pro_id_placeholder'}',
};`
  );

  fs.writeFileSync(checkoutPath, content);
  console.log('✅ Updated checkout route with real price IDs');
  console.log('Price IDs configured:');
  console.log(`  Starter: ${starterPrice || 'NOT FOUND'}`);
  console.log(`  Pro: ${proPrice || 'NOT FOUND'}`);

} catch (error) {
  console.error('❌ Failed to update price IDs:', error.message);
  console.log('You may need to update them manually in src/app/api/stripe/checkout/route.ts');
}