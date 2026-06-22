/**
 * qa-web.js — Launch interactive Playwright QA session
 *
 * Usage:
 *   pnpm run qa                                            # http://localhost:3000
 *   pnpm run qa -- --url https://example.com
 *
 * Starts the Next.js dev server (detached) + Playwright browser in one go.
 * Server process survives script exit on Windows.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

// ── Parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const urlArg = args.find(a => a.startsWith('--url='));
const BASE_URL = urlArg ? urlArg.split('=')[1] : 'http://localhost:3000';
const parsedUrl = new URL(BASE_URL);
const PORT = parsedUrl.port || 3000;

// ── Session variables ───────────────────────────────────────────────────────
const SLUG = BASE_URL
  .replace(/^https?:\/\//, '')
  .replace(/[/.:]/g, '-')
  .slice(0, 30);

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const TIMESTAMP = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

const REPORT_DIR = path.join(process.env.TEMP || '/tmp', `qa-${SLUG}-${TIMESTAMP}`);
fs.mkdirSync(REPORT_DIR, { recursive: true });

// ── Helpers ─────────────────────────────────────────────────────────────────
const log = (msg) => console.log(`  ${msg}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  try {
    const out = execSync(cmd, { timeout: 30000, encoding: 'utf8' });
    console.log(out.trim());
    return out.trim();
  } catch (e) {
    console.log(e.stdout?.trim() || e.message);
    return e.stdout?.trim() || '';
  }
};

const waitForServer = (port, host, timeoutMs = 45000) => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const sock = new net.Socket();
      sock.setTimeout(2000);
      sock.on('connect', () => { sock.destroy(); resolve(true); });
      sock.on('error', () => { sock.destroy(); retry(); });
      sock.on('timeout', () => { sock.destroy(); retry(); });
      sock.connect(port, host);
      function retry() {
        if (Date.now() - start > timeoutMs) reject(new Error(`Timeout after ${timeoutMs}ms`));
        else setTimeout(check, 1000);
      }
    };
    check();
  });
};

const isServerRunning = (port, host) => {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(1000);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
};

// ── Detached process launcher (Windows) ─────────────────────────────────────
const startDetached = (command) => {
  // Use PowerShell Start-Process to truly detach
  const psCmd = `Start-Process -WindowStyle Hidden cmd.exe -ArgumentList '/c ${command}'`;
  execSync(`powershell -Command "${psCmd}"`, { timeout: 10000, encoding: 'utf8' });
};

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== QA Web Session Setup ===');
  log(`BASE_URL   : ${BASE_URL}`);
  log(`REPORT_DIR : ${REPORT_DIR}`);

  // 1. Start dev server (detached) if not running
  const alreadyRunning = await isServerRunning(PORT, '127.0.0.1');
  if (!alreadyRunning) {
    log('Starting Next.js dev server (detached)...');
    const logFile = path.join(REPORT_DIR, 'dev-server.log');
    const nextCli = path.resolve(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
    const cwd = path.resolve(__dirname, '..');

    // Run next dev detached
    startDetached(`node "${nextCli}" dev --turbopack -p ${PORT} > "${logFile}" 2>&1`);

    log(`Waiting for server on 127.0.0.1:${PORT} (up to 45s)...`);
    try {
      await waitForServer(PORT, '127.0.0.1', 45000);
      log('✅ Server is ready.');
    } catch (e) {
      console.error(`❌ ${e.message}`);
      log('Check dev server log:');
      if (fs.existsSync(logFile)) {
        console.log(fs.readFileSync(logFile, 'utf8').split('\n').slice(-30).join('\n'));
      }
      process.exit(1);
    }
  } else {
    log('✅ Dev server already running.');
  }

  // 2. Open Playwright browser (headless by default; add --headed for visible mode)
  const headed = args.includes('--headed');
  const headFlag = headed ? '--headed' : '';
  run(`playwright-cli open ${headFlag} --browser=chrome`);
  await sleep(3000);
  run(`playwright-cli goto ${BASE_URL}`);
  await sleep(2000);

  // 3. Start video recording
  run(`playwright-cli video-start ${REPORT_DIR.replace(/\\/g, '/')}/session.webm`);

  // 4. Resize to desktop viewport
  run('playwright-cli resize 1440 900');

  // 5. Check console
  run('playwright-cli console');

  // ── Done ──
  console.log('\n=== QA session ready ===');
  console.log('\nSession variables for continuing:');
  console.log(`$env:BASE_URL = "${BASE_URL}"`);
  console.log(`$env:SLUG = "${SLUG}"`);
  console.log(`$env:TIMESTAMP = "${TIMESTAMP}"`);
  console.log(`$env:SESSION = "qa-${SLUG}-${TIMESTAMP}"`);
  console.log(`$env:REPORT_DIR = "${REPORT_DIR}"`);
  console.log('\nAvailable playwright-cli commands:');
  console.log('  playwright-cli console          # see console errors');
  console.log('  playwright-cli screenshot ...    # take screenshots');
  console.log('  playwright-cli goto <url>       # navigate');
  console.log('  playwright-cli eval <js>        # run JS');
  console.log('  playwright-cli resize <w> <h>   # change viewport');
  console.log('  playwright-cli close            # stop the browser');

  // 6. Keep alive — prevents script from exiting (which kills child processes)
  console.log('\nPress Ctrl+C to stop the QA session.');
  process.stdin.resume(); // keeps event loop alive
  await new Promise(() => {}); // never resolves
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
