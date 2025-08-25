#!/usr/bin/env bun
/**
 * Generate secure development environment with real secrets
 */

import { writeFileSync } from "fs";
import { join } from "path";
import crypto from "crypto";
import chalk from "chalk";

console.log(chalk.blue.bold("\n🔐 Generating Secure Development Environment\n"));

// Generate cryptographically secure secrets
const generateSecret = (length: number = 64): string => {
  return crypto.randomBytes(length).toString('hex');
};

const betterAuthSecret = generateSecret(32);
const jwtSecret = generateSecret(32);
const dbPassword = generateSecret(16);

console.log(chalk.green("✅ Generated secure BETTER_AUTH_SECRET"));
console.log(chalk.green("✅ Generated secure JWT_SECRET"));
console.log(chalk.green("✅ Generated secure database password"));

// Create server .env file
const serverEnv = `# Auto-generated secure development environment
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/openchat
BETTER_AUTH_SECRET=${betterAuthSecret}
JWT_SECRET=${jwtSecret}
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
ELECTRIC_URL=http://localhost:5133
ELECTRIC_INSECURE=true
DEV_MODE=true
ENABLE_DEV_AUTH=true
LOG_LEVEL=debug
`;

writeFileSync(join(process.cwd(), "apps/server/.env"), serverEnv);
console.log(chalk.green("✅ Created apps/server/.env with secure secrets"));

// Create root .env.development file  
const rootEnv = `# Auto-generated secure development environment
NODE_ENV=development
DATABASE_URL=postgresql://openchat:${dbPassword}@localhost:5432/openchat_dev
BETTER_AUTH_SECRET=${betterAuthSecret}
JWT_SECRET=${jwtSecret}
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
ELECTRIC_URL=http://localhost:5133
ELECTRIC_INSECURE=true
DEV_MODE=true
ENABLE_DEV_AUTH=true
`;

writeFileSync(join(process.cwd(), ".env.development"), rootEnv);
console.log(chalk.green("✅ Created .env.development with secure secrets"));

// Create web .env.local file
const webEnv = `NEXT_PUBLIC_SERVER_URL=http://localhost:3000
NEXT_PUBLIC_ELECTRIC_URL=http://localhost:5133
NEXT_PUBLIC_APP_URL=http://localhost:3001
`;

writeFileSync(join(process.cwd(), "apps/web/.env.local"), webEnv);
console.log(chalk.green("✅ Created apps/web/.env.local"));

// Save the database password for Docker
writeFileSync(join(process.cwd(), ".db-password"), dbPassword);
console.log(chalk.green("✅ Saved database password"));

console.log(chalk.cyan.bold("\n🎉 Secure development environment ready!"));
console.log(chalk.yellow("💡 Secrets are randomly generated each time for maximum security"));