#!/usr/bin/env node
import net from 'node:net';
import { spawn } from 'node:child_process';

const HOST = process.env.CONVEX_URL || '127.0.0.1';
const PORT = Number(process.env.CONVEX_PORT || 3210);

function checkPort(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

(async () => {
  const running = await checkPort('127.0.0.1', PORT);
  if (running) {
    console.log(`Convex dev is already running at http://127.0.0.1:${PORT} — skipping start.`);
    process.exit(0);
  }

  const child = spawn('npx', ['convex', 'dev', '--until-success'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });

  child.on('exit', (code) => process.exit(code ?? 0));
})();

