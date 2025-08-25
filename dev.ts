#!/usr/bin/env bun
/**
 * OpenChat Development Server - Just Works™
 */

import { $ } from "bun";
import { writeFileSync } from "fs";
import { join } from "path";
import crypto from "crypto";
import chalk from "chalk";

console.log(chalk.blue.bold("\n🚀 OpenChat Development Server\n"));

// Generate secure secrets
const betterAuthSecret = crypto.randomBytes(32).toString('hex');
const jwtSecret = crypto.randomBytes(32).toString('hex');

console.log(chalk.green("✅ Generated secure secrets"));

// Clean up any existing containers
try {
  await $`docker rm -f openchat-dev-postgres 2>/dev/null || true`.quiet();
} catch {}

// Start PostgreSQL 17
console.log(chalk.yellow("🐘 Starting PostgreSQL 17..."));
await $`docker run -d --name openchat-dev-postgres -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=openchat postgres:17-alpine`;

// Wait for PostgreSQL
console.log(chalk.yellow("⏳ Waiting for PostgreSQL..."));
await new Promise(resolve => setTimeout(resolve, 5000));

// Create environment for server
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/openchat";
process.env.BETTER_AUTH_SECRET = betterAuthSecret;
process.env.JWT_SECRET = jwtSecret;
process.env.NODE_ENV = "development";
process.env.DEV_MODE = "true";
process.env.ENABLE_DEV_AUTH = "true";

console.log(chalk.green("🎉 Starting development server on http://localhost:3000"));

// Start the server
try {
  await $`cd apps/server && bun --hot src/dev.ts`;
} catch (error) {
  console.log(chalk.red("❌ Server stopped"));
  await $`docker rm -f openchat-dev-postgres`.quiet();
}