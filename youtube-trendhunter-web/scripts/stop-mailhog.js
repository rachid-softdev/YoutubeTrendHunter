#!/usr/bin/env node

const { execSync } = require('child_process');
const os = require('os');

console.log('🛑 Stopping MailHog...\n');

try {
  const platform = os.platform();
  
  if (platform === 'win32') {
    execSync('taskkill /F /IM MailHog.exe', { stdio: 'inherit' });
  } else {
    execSync('pkill -f MailHog', { stdio: 'inherit' });
  }
  
  console.log('✅ MailHog stopped successfully');
} catch (error) {
  console.log('ℹ️  MailHog was not running or could not be stopped');
}