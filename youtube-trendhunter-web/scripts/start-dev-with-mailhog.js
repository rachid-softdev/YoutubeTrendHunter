#!/usr/bin/env node

const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

console.log("🚀 Starting TrendHunter with MailHog...\n");

function isMailHogRunning() {
  try {
    const platform = os.platform();
    if (platform === "win32") {
      execSync('netstat -an | findstr ":1025"', { stdio: "pipe" });
    } else {
      execSync("lsof -i :1025", { stdio: "pipe" });
    }
    return true;
  } catch {
    return false;
  }
}

function isStripeWebhookRunning() {
  try {
    const platform = os.platform();
    if (platform === "win32") {
      execSync("tasklist | findstr stripe", { stdio: "pipe" });
    } else {
      execSync('ps aux | grep "stripe listen"', { stdio: "pipe" });
    }
    return true;
  } catch {
    return false;
  }
}

function startMailHog() {
  return new Promise((resolve, reject) => {
    const mailhogPath = path.join(process.cwd(), ".mailhog");
    const platform = os.platform();
    const mailhogFile = platform === "win32" ? "MailHog.exe" : "MailHog";
    const mailhogBinary = path.join(mailhogPath, mailhogFile);

    if (!fs.existsSync(mailhogBinary)) {
      console.log("📥 MailHog not found, downloading...");
      try {
        execSync("node scripts/setup-mailhog.js", { stdio: "inherit" });
      } catch (error) {
        console.error("❌ Failed to download MailHog");
        reject(error);
        return;
      }
    }

    console.log("📧 Starting MailHog...");
    const mailhog = spawn(mailhogBinary, [], {
      stdio: "pipe",
      detached: true,
    });

    mailhog.unref();

    setTimeout(() => {
      if (isMailHogRunning()) {
        console.log("✅ MailHog started successfully");
        console.log("🌐 MailHog interface: http://localhost:8025\n");
        resolve();
      } else {
        reject(new Error("MailHog failed to start"));
      }
    }, 2000);
  });
}

function setupDatabase() {
  console.log("🗄️  Setting up MySQL database...");
  try {
    execSync("mysql --version", { stdio: "pipe" });

    execSync("npx prisma generate", { stdio: "pipe" });

    execSync("npx prisma db push", { stdio: "pipe" });

    console.log("✅ MySQL database setup complete");
  } catch (error) {
    console.error("❌ MySQL database setup failed:", error.message);
    console.log("\n💡 Make sure MySQL is running:");
    console.log("   • MySQL server installed and started");
    console.log('   • Database "trendhunter" exists');
    console.log("   • Credentials correct in .env.local");
    console.log("   • Run: npm run db:setup (first time only)");
    throw error;
  }
}

async function main() {
  try {
    setupDatabase();
    console.log("");

    if (isMailHogRunning()) {
      console.log(" MailHog is already running");
      console.log(" MailHog interface: http://localhost:8025");
    } else {
      await startMailHog();
    }

    if (isStripeWebhookRunning()) {
      console.log(" Stripe webhook forwarding is already running");
    } else {
      console.log(" Stripe webhook forwarding is not running");
      console.log(" To enable Stripe testing, run: npm run stripe:setup");
    }

    console.log("");

    console.log(" Starting Next.js development server...\n");

    const nextDev = spawn("next", ["dev", "--webpack"], {
      stdio: "inherit",
      shell: true,
    });

    process.on("SIGINT", () => {
      console.log("\n🛑 Stopping development server...");
      nextDev.kill("SIGINT");
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\n🛑 Stopping development server...");
      nextDev.kill("SIGTERM");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Failed to start development environment:", error.message);
    process.exit(1);
  }
}

main();
