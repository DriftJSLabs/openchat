#!/usr/bin/env node
// One-shot local auth E2E runner that:
// - Starts `npx convex dev --until-success` in apps/server if not already running
// - Waits for port 3210 to accept connections
// - Runs the HTTP-only auth + chats smoke test
// - Prints backend logs on failure and exits non-zero

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_CWD = path.join(process.cwd(), 'apps/server');
const CONVEX_HOST = '127.0.0.1';
const CONVEX_PORT = 3210;

function waitForPort(host, port, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function probe() {
      const sock = new net.Socket();
      sock.setTimeout(1000);
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout waiting for port'));
        setTimeout(probe, 500);
      });
      sock.once('timeout', () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout waiting for port'));
        setTimeout(probe, 500);
      });
      sock.connect(port, host, () => {
        sock.end();
        resolve(true);
      });
    })();
  });
}

async function run() {
  console.log('[doctor] Starting Convex dev (if not running)...');
  const child = spawn('npx', ['convex', 'dev', '--until-success'], {
    cwd: SERVER_CWD,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Keep track of recent logs if we need to print a tail on failure.
  let logs = '';
  const capture = (s) => {
    logs += s;
    const lines = logs.split('\n');
    if (lines.length > 500) logs = lines.slice(-500).join('\n');
  };
  child.stdout.on('data', d => { const s = d.toString(); process.stdout.write(s); capture(s); });
  child.stderr.on('data', d => { const s = d.toString(); process.stderr.write(s); capture(s); });

  try {
    await waitForPort(CONVEX_HOST, CONVEX_PORT, 25000);
    console.log('[doctor] Convex is accepting connections at http://127.0.0.1:3210');
  } catch (e) {
    console.error('[doctor] ERROR: Convex did not start in time:', e.message);
    child.kill('SIGINT');
    process.exit(1);
  }

  // Run the HTTP-only smoke
  async function runSmokeOnce() {
    return await new Promise((resolve) => {
      const smoke = spawn(process.execPath, [path.join(__dirname, 'e2e-auth-smoke.mjs')], {
        cwd: process.cwd(),
        env: { ...process.env, CONVEX_URL: `http://${CONVEX_HOST}:${CONVEX_PORT}` },
        stdio: 'inherit',
      });
      smoke.on('exit', (code) => resolve(code ?? 1));
    });
  }

  let pass = 0, fail = 0;
  async function loop() {
    console.log('[doctor] Running HTTP auth + chats smoke...');
    const code = await runSmokeOnce();
    if (code === 0) {
      pass++;
      console.log(`\n[doctor] SUCCESS (${pass} passes, ${fail} fails). Next run in 20s…`);
    } else {
      fail++;
      console.error(`\n[doctor] FAILED (${pass} passes, ${fail} fails). Next run in 20s…`);
      // Attempt to print a short tail if we captured any logs
      if (logs) {
        const tail = logs.split('\n').slice(-200).join('\n');
        console.error('\n[doctor] Last Convex logs (tail):\n', tail);
      }
    }
    setTimeout(loop, 20000);
  }

  await loop();
}

run().catch((e) => {
  console.error('[doctor] FATAL:', e);
  process.exit(1);
});
