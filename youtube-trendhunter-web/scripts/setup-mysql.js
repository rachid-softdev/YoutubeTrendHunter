#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🗄️  Setting up MySQL for TrendHunter...\n");

function checkMySQL() {
  try {
    execSync("mysql --version", { stdio: "pipe" });
    console.log("✅ MySQL client is installed");
    return true;
  } catch (error) {
    console.error("❌ MySQL client is not installed");
    console.log("Please install MySQL:");
    console.log("  • Windows: https://dev.mysql.com/downloads/mysql/");
    console.log("  • macOS: brew install mysql");
    console.log("  • Linux: sudo apt-get install mysql-server");
    return false;
  }
}

function createDatabase() {
  try {
    console.log("📊 Creating database...");

    const createDbCommand = `mysql -u root -pazerty123 -e "CREATE DATABASE IF NOT EXISTS trendhunter; SHOW DATABASES;"`;
    execSync(createDbCommand, { stdio: "inherit" });

    console.log('✅ Database "trendhunter" created successfully');
    return true;
  } catch (error) {
    console.error("❌ Failed to create database");
    console.log("Make sure MySQL is running and credentials are correct");
    console.log("Default credentials used: root/azerty123");
    console.log("You can modify them in your .env.local file");
    return false;
  }
}

function setupEnvFile() {
  const envLocalPath = path.join(process.cwd(), ".env.local");
  const envExamplePath = path.join(process.cwd(), "env.example");

  if (!fs.existsSync(envLocalPath)) {
    if (fs.existsSync(envExamplePath)) {
      console.log("Creating .env.local from env.example...");
      fs.copyFileSync(envExamplePath, envLocalPath);
      console.log("Created .env.local successfully");
    } else {
      console.error("env.example file not found");
      return false;
    }
  } else {
    console.log(".env.local already exists");
  }

  return true;
}

function setupPrisma() {
  try {
    console.log("🔧 Setting up Prisma...");

    if (!setupEnvFile()) {
      return false;
    }

    const envPath = path.join(process.cwd(), ".env.local");
    const envContent = fs.readFileSync(envPath, "utf8");

    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").replace(/^"|"$/g, "");
          process.env[key] = value;
        }
      }
    });

    console.log("Environment variables loaded from .env.local");
    console.log("DATABASE_URL:", process.env.DATABASE_URL ? "Set" : "Not set");

    execSync("npx prisma generate", { stdio: "inherit" });

    execSync("npx prisma db push", { stdio: "inherit" });

    console.log("✅ Prisma setup complete");
    return true;
  } catch (error) {
    console.error("❌ Prisma setup failed:", error.message);
    console.log("Make sure .env.local contains DATABASE_URL");
    return false;
  }
}

function main() {
  console.log("🚀 MySQL Setup for TrendHunter\n");

  if (!checkMySQL()) {
    process.exit(1);
  }

  if (!createDatabase()) {
    process.exit(1);
  }

  if (!setupPrisma()) {
    process.exit(1);
  }

  console.log("\n🎉 MySQL setup complete!");
  console.log("\nNext steps:");
  console.log("1. .env.local has been created automatically");
  console.log("2. Update MySQL credentials in .env.local if needed");
  console.log("3. Run: npm run dev");
  console.log("\nDatabase connection:");
  console.log("• Host: localhost");
  console.log("• Port: 3306");
  console.log("• Database: trendhunter");
  console.log("• User: root");
  console.log("• Password: azerty123");
}

main();
