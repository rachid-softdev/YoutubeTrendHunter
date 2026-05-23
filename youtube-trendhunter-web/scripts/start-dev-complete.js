#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

console.log("🚀 Starting TrendHunter Complete Development Environment...\n");

let runningProcesses = [];

function checkPostgreSQL() {
  try {
    execSync("psql --version", { stdio: "pipe" });
    console.log("✅ PostgreSQL client is available");
    return true;
  } catch {
    console.error("❌ PostgreSQL client is not installed");
    console.log("Please install PostgreSQL:");
    console.log("  • Windows: https://www.postgresql.org/download/windows/");
    console.log("  • macOS:   brew install postgresql");
    console.log("  • Linux:   sudo apt-get install postgresql");
    return false;
  }
}

function setupDatabase() {
  try {
    console.log("🗄️  Setting up PostgreSQL database...");

    const envPath = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) {
      console.log("   Creating .env.local from env.example...");
      fs.copyFileSync(path.join(process.cwd(), ".env.example"), envPath);
    }

    fs.readFileSync(envPath, "utf8")
      .split("\n")
      .forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key && valueParts.length > 0) {
            process.env[key] = valueParts.join("=").replace(/^"|"$/g, "");
          }
        }
      });

    execSync("psql --version", { stdio: "pipe" });

    const schemaSqlPath = path.join(process.cwd(), "scripts", "create-schema.sql");
    if (fs.existsSync(schemaSqlPath)) {
      console.log("   Creating schema...");
      let dbUrl = process.env.DATABASE_URL || "postgresql://dev:azerty123@localhost:5432/dev";
      dbUrl = dbUrl.split("?")[0];
      execSync(`psql "${dbUrl}" -f "${schemaSqlPath}"`, { stdio: "pipe" });
      console.log("   ✅ Schema YoutubeTrendHunter created");
    }

    const prismaClientPath = path.join(process.cwd(), "node_modules", ".prisma", "client");
    if (!fs.existsSync(prismaClientPath)) {
      console.log("   Generating Prisma client...");
      execSync("npx prisma generate", { stdio: "pipe" });
    } else {
      console.log("   Prisma client already exists, skipping generation");
    }

    try {
      execSync("npx prisma db push", { stdio: "pipe" });
      console.log("✅ PostgreSQL database setup complete");
    } catch (pushError) {
      if (
        pushError.message.includes("existe déjà") ||
        pushError.message.includes("already exists")
      ) {
        console.log("   ⚠️  Tables already exist, skipping db push");
        console.log("   ✅ PostgreSQL database already configured");
      } else {
        throw pushError;
      }
    }
    return true;
  } catch (error) {
    console.error("❌ PostgreSQL database setup failed:", error.message);
    console.log("\n💡 Make sure PostgreSQL is running:");
    console.log("   • PostgreSQL server installed and started");
    console.log('   • Database "dev" exists');
    console.log("   • Schema created: psql -f scripts/create-schema.sql");
    console.log("   • Credentials correct in .env.local");
    return false;
  }
}

function isMailHogRunning() {
  try {
    os.platform() === "win32"
      ? execSync('netstat -an | findstr ":1025"', { stdio: "pipe" })
      : execSync("lsof -i :1025", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function startMailHog() {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    const mailhogPath = path.join(process.cwd(), ".mailhog");
    const mailhogFile = platform === "win32" ? "MailHog.exe" : "MailHog";
    const mailhogBinary = path.join(mailhogPath, mailhogFile);

    if (!fs.existsSync(mailhogBinary)) {
      console.log("📥 MailHog not found, downloading...");
      if (!fs.existsSync(mailhogPath)) fs.mkdirSync(mailhogPath, { recursive: true });

      const downloadUrl =
        platform === "win32"
          ? "https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_windows_amd64.exe"
          : platform === "darwin"
            ? "https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_darwin_amd64"
            : "https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_linux_amd64";

      const downloadCmd =
        platform === "win32"
          ? `curl -L -o "${mailhogBinary}" "${downloadUrl}"`
          : `curl -L -o "${mailhogBinary}" "${downloadUrl}" && chmod +x "${mailhogBinary}"`;

      try {
        execSync(downloadCmd, { stdio: "inherit" });
        console.log("✅ MailHog downloaded successfully");
      } catch (error) {
        console.error("❌ Failed to download MailHog:", error.message);
        return reject(error);
      }
    }

    console.log("📧 Starting MailHog...");
    const mailhog = spawn(mailhogBinary, [], { stdio: "pipe", detached: true });
    runningProcesses.push(mailhog);

    setTimeout(() => {
      if (isMailHogRunning()) {
        console.log("✅ MailHog started");
        console.log("   → http://localhost:8025");
        mailhog.unref();
        resolve();
      } else {
        mailhog.kill();
        reject(new Error("MailHog failed to start"));
      }
    }, 2000);
  });
}

function getPidOnPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr ":${port} "`, { stdio: "pipe" }).toString();
    const lines = out
      .trim()
      .split("\n")
      .filter((l) => l.includes("LISTENING"));
    if (!lines.length) return null;
    const parts = lines[0].trim().split(/\s+/);
    return parts[parts.length - 1];
  } catch {
    return null;
  }
}

function tryExec(cmd, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), timeoutMs);
    try {
      execSync(cmd, { stdio: "pipe", timeout: timeoutMs });
      clearTimeout(timer);
      resolve("ok");
    } catch {
      clearTimeout(timer);
      resolve("error");
    }
  });
}

async function killPort(port) {
  const platform = os.platform();

  if (platform !== "win32") {
    await tryExec(`lsof -ti :${port} | xargs kill -9`);
    await new Promise((r) => setTimeout(r, 1000));
    return;
  }

  const pid = getPidOnPort(port);
  if (!pid) return;

  console.log(`⚠️  Port ${port} occupied by PID ${pid} — killing it...`);

  await Promise.all([
    tryExec(`taskkill /PID ${pid} /F /T`),
    tryExec(`wmic process where ProcessId=${pid} delete`),
    tryExec(`powershell -Command "Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue"`),
  ]);

  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (!getPidOnPort(port)) {
      console.log(`✅ Port ${port} is now free`);
      return;
    }
  }

  await tryExec(
    `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
  );
  await new Promise((r) => setTimeout(r, 1500));

  if (!getPidOnPort(port)) {
    console.log(`✅ Port ${port} is now free`);
  } else {
    console.log(`⚠️  Port ${port} could not be freed — Next.js may bind to a different port`);
  }
}

function writeEnvKey(key, value) {
  const envPath = path.join(process.cwd(), ".env.local");
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  if (new RegExp(`^${key}=`, "m").test(content)) {
    content = content.replace(new RegExp(`^${key}=.*`, "m"), `${key}="${value}"`);
  } else {
    content += `\n${key}="${value}"\n`;
  }

  fs.writeFileSync(envPath, content);
}

function startStripeWebhook() {
  return new Promise((resolve) => {
    console.log("💳 Starting Stripe webhook forwarding...");

    try {
      execSync("stripe --version", { stdio: "pipe" });
    } catch {
      console.log("⚠️  Stripe CLI not installed — skipping webhook forwarding.");
      console.log("   Install with: npm run stripe:setup");
      return resolve();
    }

    try {
      execSync("stripe config --list", { stdio: "pipe" });
    } catch {
      console.log("⚠️  Stripe CLI not logged in — skipping webhook forwarding.");
      console.log("   Login with: stripe login");
      return resolve();
    }

    const webhook = spawn(
      "stripe",
      ["listen", "--forward-to", "localhost:3000/api/stripe/webhook"],
      { stdio: ["pipe", "pipe", "pipe"], detached: true },
    );

    runningProcesses.push(webhook);

    let resolved = false;

    const handleOutput = (data) => {
      const output = data.toString();
      const trimmed = output.trim();
      if (trimmed) console.log("   [stripe]", trimmed);

      const secretMatch = output.match(/whsec_[a-zA-Z0-9]+/);
      if (secretMatch) {
        const secret = secretMatch[0];
        writeEnvKey("STRIPE_WEBHOOK_SECRET", secret);
        console.log("🔐 STRIPE_WEBHOOK_SECRET saved to .env.local");
      }

      if (!resolved && (output.includes("Ready!") || output.includes("> Ready!"))) {
        resolved = true;
        console.log("✅ Stripe webhook forwarding ready");
        console.log("   → localhost:3000/api/stripe/webhook");
        webhook.unref();
        resolve();
      }
    };

    webhook.stdout.on("data", handleOutput);
    webhook.stderr.on("data", handleOutput);

    webhook.on("error", (error) => {
      console.log("⚠️  Failed to start Stripe webhook:", error.message);
      resolve();
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (!webhook.killed) {
          console.log("✅ Stripe webhook forwarding started (timeout fallback)");
          webhook.unref();
        }
        resolve();
      }
    }, 10000);
  });
}

function setupStripeProducts() {
  try {
    console.log("💳 Setting up Stripe products...");
    execSync("npx tsx scripts/setup-stripe.ts", { stdio: "pipe" });
    console.log("✅ Stripe products setup complete");
  } catch (error) {
    console.error("⚠️  Stripe products setup failed:", error.message);
    console.log("   Not critical — set them up manually later");
  }
}

function updateStripePriceIds() {
  try {
    console.log("💰 Updating Stripe price IDs...");
    execSync("node scripts/update-stripe-price-ids.js", { stdio: "pipe" });
    console.log("✅ Stripe price IDs updated");
  } catch (error) {
    console.error("⚠️  Stripe price IDs update failed:", error.message);
  }
}

function setupResend() {
  try {
    console.log("📨 Setting up Resend...");
    execSync("npx tsx scripts/setup-resend.ts", { stdio: "pipe" });
    console.log("✅ Resend setup complete");
  } catch (error) {
    console.error("⚠️  Resend setup failed:", error.message);
    console.log("   Not critical — set it up manually later");
  }
}

function cleanup() {
  console.log("\n🛑 Stopping all services...");

  runningProcesses.forEach((proc, i) => {
    try {
      if (proc && !proc.killed) {
        proc.kill("SIGTERM");
        console.log(`   Stopped process ${i + 1}`);
      }
    } catch {
      // ignore
    }
  });

  try {
    os.platform() === "win32"
      ? (execSync("taskkill /F /IM MailHog.exe", { stdio: "pipe" }),
        execSync("taskkill /F /IM stripe.exe", { stdio: "pipe" }))
      : (execSync("pkill -f MailHog", { stdio: "pipe" }),
        execSync('pkill -f "stripe listen"', { stdio: "pipe" }));
  } catch {
    // ignore
  }

  console.log("✅ All services stopped");
  process.exit(0);
}

async function main() {
  try {
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("SIGHUP", cleanup);

    console.log("🔧 Setting up development environment...\n");

    if (!checkPostgreSQL() || !setupDatabase()) process.exit(1);
    console.log("");

    if (isMailHogRunning()) {
      console.log("📧 MailHog already running → http://localhost:8025");
    } else {
      await startMailHog();
    }
    console.log("");

    await killPort(3000);
    console.log("");

    console.log("🚀 Starting Next.js development server...\n");
    const nextDev = spawn("next", ["dev", "--webpack"], { stdio: "inherit", shell: true });
    runningProcesses.push(nextDev);

    nextDev.on("close", (code) => {
      console.log(`Next.js exited with code ${code}`);
      cleanup();
    });

    await new Promise((resolve) => setTimeout(resolve, 5000));

    await startStripeWebhook();
    console.log("");

    setupStripeProducts();
    updateStripePriceIds();
    setupResend();

    console.log("");
    console.log("🌟 Development environment is ready!");
    console.log("");
    console.log("📊 Services:");
    console.log("   • PostgreSQL       → localhost:5432");
    console.log("   • MailHog UI       → http://localhost:8025");
    console.log("   • Next.js          → http://localhost:3000");
    console.log("   • Stripe Webhooks  → localhost:3000/api/stripe/webhook");
  } catch (error) {
    console.error("❌ Failed to start development environment:", error.message);
    cleanup();
  }
}

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error.message);
  cleanup();
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled rejection:", reason);
  cleanup();
});

main();
