#!/usr/bin/env node

const { execSync } = require("child_process");
const os = require("os");

console.log("Stopping Stripe CLI webhook forwarding...\n");

try {
  const platform = os.platform();

  if (platform === "win32") {
    execSync("taskkill /F /IM stripe.exe", { stdio: "inherit" });
  } else {
    execSync('pkill -f "stripe listen"', { stdio: "inherit" });
  }

  console.log("Stripe CLI webhook forwarding stopped successfully");
} catch (error) {
  console.log("Stripe CLI was not running or could not be stopped");
}
