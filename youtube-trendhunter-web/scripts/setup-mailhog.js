#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

console.log("🚀 Setting up MailHog without Docker...\n");

const platform = os.platform();

let mailhogUrl, mailhogFile;

if (platform === "win32") {
  mailhogUrl =
    "https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_windows_amd64.exe";
  mailhogFile = "MailHog.exe";
} else if (platform === "darwin") {
  mailhogUrl = "https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_darwin_amd64";
  mailhogFile = "MailHog";
} else if (platform === "linux") {
  mailhogUrl = "https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_linux_amd64";
  mailhogFile = "MailHog";
} else {
  console.error("❌ Unsupported platform:", platform);
  process.exit(1);
}

const mailhogDir = path.join(process.cwd(), ".mailhog");
const mailhogPath = path.join(mailhogDir, mailhogFile);

if (!fs.existsSync(mailhogDir)) {
  fs.mkdirSync(mailhogDir, { recursive: true });
}

if (!fs.existsSync(mailhogPath)) {
  console.log(`📥 Downloading MailHog for ${platform}...`);

  try {
    if (platform === "win32") {
      execSync(
        `powershell -Command "Invoke-WebRequest -Uri '${mailhogUrl}' -OutFile '${mailhogPath}'"`,
        { stdio: "inherit" },
      );
    } else {
      execSync(`curl -L "${mailhogUrl}" -o "${mailhogPath}"`, { stdio: "inherit" });
    }

    if (platform !== "win32") {
      fs.chmodSync(mailhogPath, "755");
    }

    console.log("✅ MailHog downloaded successfully");
  } catch (error) {
    console.error("❌ Failed to download MailHog:", error.message);
    process.exit(1);
  }
} else {
  console.log("✅ MailHog already exists");
}

console.log("🐳 Starting MailHog...");
try {
  const mailhog = spawn(mailhogPath, [], {
    stdio: "pipe",
    detached: true,
  });

  mailhog.unref();

  console.log("✅ MailHog started successfully");
  console.log("\n📧 MailHog is available at: http://localhost:8025");
  console.log("📮 SMTP server is available at: localhost:1025");

  console.log("\n🔧 Development environment setup complete!");
  console.log("\nNext steps:");
  console.log("1. Update your .env.local with:");
  console.log('   NODE_ENV="development"');
  console.log("2. Run: npm run test:mailhog");
  console.log("3. Run: npm run dev");
  console.log("4. Visit: http://localhost:3000");
  console.log("5. Check emails at: http://localhost:8025");
} catch (error) {
  console.error("❌ Failed to start MailHog:", error.message);
  process.exit(1);
}
