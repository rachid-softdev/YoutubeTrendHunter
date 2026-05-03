#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('Testing Stripe webhooks...\n');

const webhooks = [
  {
    name: 'Payment Success',
    command: 'stripe trigger checkout.session.completed',
    description: 'Simulates a successful payment completion'
  },
  {
    name: 'Payment Intent Success',
    command: 'stripe trigger payment_intent.succeeded',
    description: 'Simulates a payment intent success'
  },
  {
    name: 'Customer Subscription Created',
    command: 'stripe trigger customer.subscription.created',
    description: 'Simulates a new customer subscription'
  },
  {
    name: 'Customer Subscription Updated',
    command: 'stripe trigger customer.subscription.updated',
    description: 'Simulates a subscription update'
  },
  {
    name: 'Customer Subscription Deleted',
    command: 'stripe trigger customer.subscription.deleted',
    description: 'Simulates a subscription cancellation'
  },
  {
    name: 'Invoice Paid',
    command: 'stripe trigger invoice.payment_succeeded',
    description: 'Simulates an invoice payment success'
  }
];

function runWebhookTest(webhook) {
  try {
    console.log(`\n--- Testing: ${webhook.name} ---`);
    console.log(`Description: ${webhook.description}`);
    console.log(`Command: ${webhook.command}`);
    console.log('Executing...');
    
    execSync(webhook.command, { stdio: 'inherit' });
    
    console.log(`\n${webhook.name} test completed successfully!`);
    console.log('Check your application logs and MailHog for the email notifications.');
    
  } catch (error) {
    console.error(`Failed to test ${webhook.name}:`, error.message);
  }
}

function showMenu() {
  console.log('\nStripe Webhook Testing Menu:');
  console.log('='.repeat(50));
  
  webhooks.forEach((webhook, index) => {
    console.log(`${index + 1}. ${webhook.name}`);
    console.log(`   ${webhook.description}`);
  });
  
  console.log(`${webhooks.length + 1}. Test all webhooks`);
  console.log('0. Exit');
  console.log('\nSelect a webhook to test (0-' + (webhooks.length + 1) + '):');
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    showMenu();
    
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      const chunk = process.stdin.read();
      if (chunk !== null) {
        const choice = parseInt(chunk.trim());
        
        if (choice === 0) {
          console.log('Goodbye!');
          process.exit(0);
        } else if (choice === webhooks.length + 1) {
          console.log('\nTesting all webhooks...');
          webhooks.forEach(runWebhookTest);
          console.log('\nAll webhook tests completed!');
          process.exit(0);
        } else if (choice >= 1 && choice <= webhooks.length) {
          runWebhookTest(webhooks[choice - 1]);
          process.exit(0);
        } else {
          console.log('Invalid choice. Please try again.');
          showMenu();
        }
      }
    });
  } else {
    const webhookName = args[0].toLowerCase();
    const webhook = webhooks.find(w => 
      w.name.toLowerCase().includes(webhookName) || 
      w.command.includes(webhookName)
    );
    
    if (webhook) {
      runWebhookTest(webhook);
    } else {
      console.error('Webhook not found. Available webhooks:');
      webhooks.forEach(w => console.log(`  - ${w.name.toLowerCase()}`));
      process.exit(1);
    }
  }
}

try {
  execSync('stripe config --list', { stdio: 'pipe' });
} catch (error) {
  console.error('Stripe CLI is not configured. Please run: npm run stripe:setup');
  process.exit(1);
}

main();