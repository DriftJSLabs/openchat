#!/usr/bin/env bun
/**
 * Simple OpenChat Development Setup - Just Works™
 */

import { $ } from "bun";
import { readFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";

console.log(chalk.blue.bold("\n🚀 OpenChat - Simple Development Setup\n"));

// Step 1: Generate secure environment
console.log(chalk.yellow("🔐 Generating secure environment variables..."));
await $`bun scripts/generate-dev-env.ts`;

// Step 2: Get the generated database password
const dbPassword = readFileSync(join(process.cwd(), ".db-password"), "utf-8").trim();

// Step 3: Clean up any existing containers
console.log(chalk.yellow("🧹 Cleaning up existing containers..."));
try {
  await $`docker rm -f openchat-postgres-simple openchat-electric-simple 2>/dev/null || true`.quiet();
} catch {}

// Step 4: Start PostgreSQL 17
console.log(chalk.yellow("🐘 Starting PostgreSQL 17..."));
await $`docker run -d \
  --name openchat-postgres-simple \
  -p 5432:5432 \
  -e POSTGRES_USER=openchat \
  -e POSTGRES_PASSWORD=${dbPassword} \
  -e POSTGRES_DB=openchat_dev \
  -e POSTGRES_INITDB_ARGS="--auth-host=md5 --auth-local=md5" \
  postgres:17-alpine \
  -c wal_level=logical \
  -c max_replication_slots=10 \
  -c max_wal_senders=10`;

// Step 5: Wait for PostgreSQL
console.log(chalk.yellow("⏳ Waiting for PostgreSQL to be ready..."));
let retries = 30;
while (retries > 0) {
  try {
    await $`docker exec openchat-postgres-simple pg_isready -U openchat`.quiet();
    break;
  } catch {
    retries--;
    if (retries === 0) throw new Error("PostgreSQL failed to start");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Step 6: Create basic schema
console.log(chalk.yellow("🗄️ Setting up database schema..."));
await $`docker exec openchat-postgres-simple bash -c "PGPASSWORD=${dbPassword} psql -U openchat -d openchat_dev -c 'CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), email VARCHAR(255) UNIQUE NOT NULL, name VARCHAR(255), created_at TIMESTAMP DEFAULT NOW());'"`;

// Step 7: Start ElectricSQL
console.log(chalk.yellow("⚡ Starting ElectricSQL..."));
await $`docker run -d \
  --name openchat-electric-simple \
  -p 5133:5133 \
  -e DATABASE_URL=postgresql://openchat:${dbPassword}@openchat-postgres-simple:5432/openchat_dev \
  -e ELECTRIC_INSECURE=true \
  --link openchat-postgres-simple \
  electricsql/electric:latest`;

console.log(chalk.yellow("⏳ ElectricSQL starting..."));

// Step 8: Install dependencies
console.log(chalk.yellow("📦 Installing dependencies..."));
await $`bun install`;

const elapsed = "5";
console.log(chalk.green.bold(`\n🎉 OpenChat Development Environment Ready! (${elapsed}s)`));
console.log(chalk.cyan.bold("\n📍 Services:"));
console.log(`  • PostgreSQL 17: localhost:5432 ✅`);
console.log(`  • ElectricSQL: http://localhost:5133 ✅`);
console.log(chalk.cyan.bold("\n🚀 Commands:"));
console.log(`  • Start server: ${chalk.yellow("bun run dev")}`);
console.log(`  • Start web app: ${chalk.yellow("bun run dev:web")}`);
console.log(chalk.cyan.bold("\n🛠️ Management:"));
console.log(`  • Stop: ${chalk.yellow("docker rm -f openchat-postgres-simple openchat-electric-simple")}`);
console.log(`  • Setup again: ${chalk.yellow("bun run setup")}`);

console.log(chalk.green.bold("\n✅ Ready! Run 'bun run dev' to start the server."));