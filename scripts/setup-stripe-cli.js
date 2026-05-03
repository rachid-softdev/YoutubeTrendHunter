#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('Setting up Stripe CLI for TrendHunter...\n');

function checkStripeCLI() {
  try {
    execSync('stripe --version', { stdio: 'pipe' });
    console.log('Stripe CLI is installed');
    return true;
  } catch (error) {
    console.error('Stripe CLI is not installed');
    console.log('Please install Stripe CLI:');
    console.log('  Windows: Download from https://stripe.com/docs/stripe-cli');
    console.log('  macOS: brew install stripe/stripe-cli/stripe');
    console.log('  Linux: curl -s https://packages.stripe.com/api/security/keypairs/stripe-cli-gpg/public.key | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg');
    console.log('         echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.com/stripe-cli-debian/ stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list');
    console.log('         sudo apt-get update && sudo apt-get install stripe');
    return false;
  }
}

function checkStripeLogin() {
  try {
    execSync('stripe config --list', { stdio: 'pipe' });
    console.log('Stripe CLI is configured');
    return true;
  } catch (error) {
    console.log('Stripe CLI needs to be logged in');
    return false;
  }
}

function stripeLogin() {
  try {
    console.log('Please login to Stripe...');
    execSync('stripe login', { stdio: 'inherit' });
    console.log('Successfully logged in to Stripe');
    return true;
  } catch (error) {
    console.error('Failed to login to Stripe');
    return false;
  }
}

function startStripeWebhook() {
  return new Promise((resolve, reject) => {
    console.log('Starting Stripe webhook forwarding...');
    
    const webhook = spawn('stripe', ['listen', '--forward-to', 'localhost:3000/api/stripe/webhook'], {
      stdio: 'pipe',
      detached: true
    });

    webhook.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(output);
      
      if (output.includes('Ready!')) {
        console.log('Stripe webhook forwarding started successfully');
        webhook.unref();
        resolve();
      }
    });

    webhook.stderr.on('data', (data) => {
      console.error('Stripe webhook error:', data.toString());
    });

    webhook.on('error', (error) => {
      console.error('Failed to start Stripe webhook:', error.message);
      reject(error);
    });

    setTimeout(() => {
      if (!webhook.killed) {
        webhook.kill();
        reject(new Error('Stripe webhook startup timeout'));
      }
    }, 10000);
  });
}

function createTestFixtures() {
  try {
    console.log('Creating Stripe test fixtures...');
    
    const fixturesDir = path.join(process.cwd(), 'scripts', 'stripe-fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const paymentSuccessFixture = {
      url: '/api/stripe/webhook',
      method: 'POST',
      headers: {
        'stripe-signature': 'test_signature'
      },
      body: {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer_details: {
              email: 'test@example.com'
            },
            metadata: {
              plan: 'Pro'
            },
            amount_total: 2000,
            payment_status: 'paid'
          }
        }
      }
    };

    fs.writeFileSync(
      path.join(fixturesDir, 'payment-success.json'),
      JSON.stringify(paymentSuccessFixture, null, 2)
    );

    console.log('Test fixtures created in scripts/stripe-fixtures/');
    return true;
  } catch (error) {
    console.error('Failed to create test fixtures:', error.message);
    return false;
  }
}

async function main() {
  console.log('Setting up Stripe CLI for TrendHunter\n');

  if (!checkStripeCLI()) {
    process.exit(1);
  }

  if (!checkStripeLogin()) {
    if (!stripeLogin()) {
      process.exit(1);
    }
  }

  if (!createTestFixtures()) {
    process.exit(1);
  }

  try {
    await startStripeWebhook();
    
    console.log('\nStripe CLI setup complete!');
    console.log('\nFeatures available:');
    console.log('  Webhook forwarding: localhost:3000/api/stripe/webhook');
    console.log('  Test fixtures: scripts/stripe-fixtures/');
    console.log('  CLI commands: stripe --help');
    
    console.log('\nTesting commands:');
    console.log('  stripe trigger payment_intent.succeeded');
    console.log('  stripe trigger checkout.session.completed');
    console.log('  stripe trigger customer.subscription.created');
    
    console.log('\nTo stop webhook forwarding: Ctrl+C or npm run stripe:stop');
    
  } catch (error) {
    console.error('Failed to start Stripe webhook forwarding:', error.message);
    process.exit(1);
  }
}

main();