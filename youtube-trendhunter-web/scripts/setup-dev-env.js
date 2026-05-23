#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🚀 Setting up TrendHunter development environment...\n");

console.log("📧 Starting MailHog...");
try {
  execSync("node scripts/setup-mailhog.js", { stdio: "inherit" });
  console.log("✅ MailHog started successfully");
} catch (error) {
  console.error("❌ Failed to start MailHog");
  process.exit(1);
}

console.log("⏳ Waiting for MailHog to be ready...");
setTimeout(() => {
  console.log("✅ Services should be ready now\n");

  console.log("📧 MailHog is available at: http://localhost:8025");
  console.log("📮 SMTP server is available at: localhost:1025\n");

  console.log("🔧 Development environment setup complete!");
  console.log("\nNext steps:");
  console.log("1. Update your .env.local with:");
  console.log('   NODE_ENV="development"');
  console.log("2. Run: npm run test:mailhog");
  console.log("3. Run: npm run dev");
  console.log("4. Visit: http://localhost:3000");
  console.log("5. Check emails at: http://localhost:8025");
  console.log("\n💡 To stop MailHog later, run: npm run dev:services:stop");
}, 3000);
