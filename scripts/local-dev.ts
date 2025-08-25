#!/usr/bin/env bun

import { $ } from "bun";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import chalk from "chalk";

console.log(chalk.blue.bold("🚀 Setting up OpenChat local development environment\n"));

async function setupPostgreSQL() {
  console.log(chalk.yellow("📦 Setting up PostgreSQL..."));
  
  // Create data directory
  const dataDir = join(process.cwd(), ".postgres-data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    console.log(`✓ Created data directory: ${dataDir}`);
  }

  // Stop and remove existing container
  try {
    await $`docker stop openchat-postgres`.quiet();
    await $`docker rm openchat-postgres`.quiet();
    console.log("✓ Cleaned up existing PostgreSQL container");
  } catch (e) {
    // Container doesn't exist, that's fine
  }

  // Start PostgreSQL
  console.log("⏳ Starting PostgreSQL container...");
  await $`docker run -d \
    --name openchat-postgres \
    -e POSTGRES_USER=openchat \
    -e POSTGRES_PASSWORD=openchat_dev \
    -e POSTGRES_DB=openchat \
    -p 5432:5432 \
    -v ${dataDir}:/var/lib/postgresql/data \
    postgres:15`;

  // Wait for PostgreSQL to be ready
  console.log("⏳ Waiting for PostgreSQL to be ready...");
  for (let i = 0; i < 30; i++) {
    try {
      await $`docker exec openchat-postgres pg_isready -U openchat`.quiet();
      break;
    } catch (e) {
      if (i === 29) throw new Error("PostgreSQL failed to start");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(chalk.green("✅ PostgreSQL is ready at localhost:5432"));
}

async function setupConvex() {
  console.log(chalk.yellow("🔗 Setting up Convex locally..."));

  // Create convex directory
  const convexDir = join(process.cwd(), "convex");
  if (!existsSync(convexDir)) {
    mkdirSync(convexDir, { recursive: true });
    console.log(`✓ Created convex directory`);
  }

  // Install Convex CLI if not present
  try {
    await $`bunx convex --version`.quiet();
    console.log("✓ Convex CLI is available");
  } catch (e) {
    console.log("📥 Installing Convex CLI...");
    await $`bun add -D convex`;
  }

  // Initialize Convex if not already initialized
  const convexConfigPath = join(process.cwd(), "convex.config.ts");
  if (!existsSync(convexConfigPath)) {
    console.log("⚙️ Initializing Convex project...");
    await $`bunx convex init --yes`;
  }

  // Create basic Convex functions
  const convexSchemaPath = join(convexDir, "schema.ts");
  if (!existsSync(convexSchemaPath)) {
    const schemaContent = `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    content: v.string(),
    author: v.string(),
    timestamp: v.number(),
    chatId: v.string(),
  }),
  chats: defineTable({
    name: v.string(),
    createdAt: v.number(),
    participants: v.array(v.string()),
  }),
});`;
    
    writeFileSync(convexSchemaPath, schemaContent);
    console.log("✓ Created Convex schema");
  }

  // Create a basic messages function
  const messagesPath = join(convexDir, "messages.ts");
  if (!existsSync(messagesPath)) {
    const messagesContent = `import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    return await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("chatId"), chatId))
      .order("desc")
      .collect();
  },
});

export const send = mutation({
  args: {
    content: v.string(),
    author: v.string(),
    chatId: v.string(),
  },
  handler: async (ctx, { content, author, chatId }) => {
    await ctx.db.insert("messages", {
      content,
      author,
      chatId,
      timestamp: Date.now(),
    });
  },
});`;
    
    writeFileSync(messagesPath, messagesContent);
    console.log("✓ Created basic Convex functions");
  }

  console.log(chalk.green("✅ Convex is configured locally"));
}

async function updateEnvironmentVariables() {
  console.log(chalk.yellow("📝 Updating environment variables..."));

  const postgresUrl = "postgresql://openchat:openchat_dev@localhost:5432/openchat";

  // Update server .env
  const serverEnvPath = join(process.cwd(), "apps/server/.env");
  let serverEnv = "";
  
  if (existsSync(serverEnvPath)) {
    serverEnv = readFileSync(serverEnvPath, "utf-8");
  }

  // Update or add environment variables
  const serverVars = {
    DATABASE_URL: postgresUrl,
  };

  for (const [key, value] of Object.entries(serverVars)) {
    if (serverEnv.includes(`${key}=`)) {
      serverEnv = serverEnv.replace(new RegExp(`${key}=.*`, "g"), `${key}=${value}`);
    } else {
      serverEnv += `\n${key}=${value}`;
    }
  }

  writeFileSync(serverEnvPath, serverEnv.trim() + "\n");
  console.log("✓ Updated apps/server/.env");

  // Update web .env.local - we'll get the Convex URL after dev server starts
  const webEnvPath = join(process.cwd(), "apps/web/.env.local");
  let webEnv = "";
  
  if (existsSync(webEnvPath)) {
    webEnv = readFileSync(webEnvPath, "utf-8");
  }

  writeFileSync(webEnvPath, webEnv.trim() + "\n");
  console.log("✓ Updated apps/web/.env.local");

  console.log(chalk.green("✅ Environment variables updated"));
}

async function createCleanupScript() {
  const cleanupScript = `#!/usr/bin/env bun

import { $ } from "bun";
import chalk from "chalk";

console.log(chalk.yellow("🧹 Cleaning up local development environment..."));

try {
  await $\`docker stop openchat-postgres\`.quiet();
  await $\`docker rm openchat-postgres\`.quiet();
  console.log(chalk.green("✅ Stopped and removed PostgreSQL container"));
} catch (e) {
  console.log(chalk.yellow("⚠️ PostgreSQL container may not have been running"));
}

console.log(chalk.blue("👋 Cleanup complete!"));
`;

  writeFileSync(join(process.cwd(), "scripts/cleanup-local.ts"), cleanupScript);
  console.log("✓ Created cleanup script at scripts/cleanup-local.ts");
}

async function createDevScript() {
  const devScript = `#!/usr/bin/env bun

import { spawn } from "bun";
import chalk from "chalk";

console.log(chalk.blue.bold("🚀 Starting OpenChat development servers\\n"));

// Start Convex dev server
console.log(chalk.yellow("Starting Convex dev server..."));
const convexProcess = spawn(["bunx", "convex", "dev"], {
  stdout: "pipe",
  stderr: "pipe",
});

// Wait a bit for Convex to start
await new Promise(resolve => setTimeout(resolve, 3000));

// Start web and server development
console.log(chalk.yellow("Starting web and server development..."));
const webProcess = spawn(["bun", "run", "dev:web"], {
  stdout: "inherit", 
  stderr: "inherit"
});

const serverProcess = spawn(["bun", "run", "dev:server"], {
  stdout: "inherit",
  stderr: "inherit" 
});

console.log(chalk.green("\\n✅ All development servers started!"));
console.log(chalk.blue("\\n📍 Services:"));
console.log(\`• PostgreSQL: \${chalk.cyan("localhost:5432")}\`);
console.log(\`• Convex Dashboard: \${chalk.cyan("https://dashboard.convex.dev")}\`);
console.log(\`• Web app: \${chalk.cyan("http://localhost:3001")}\`);
console.log(\`• API server: \${chalk.cyan("http://localhost:3000")}\`);
console.log(chalk.yellow("\\nPress Ctrl+C to stop all servers"));

// Handle cleanup on exit
const cleanup = () => {
  console.log(chalk.yellow("\\n🛑 Shutting down servers..."));
  convexProcess.kill();
  webProcess.kill();  
  serverProcess.kill();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Wait for processes
await Promise.race([
  convexProcess.exited,
  webProcess.exited,
  serverProcess.exited
]);`;

  writeFileSync(join(process.cwd(), "scripts/dev.ts"), devScript);
  console.log("✓ Created development script at scripts/dev.ts");
}

async function updatePackageJson() {
  const packageJsonPath = join(process.cwd(), "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  
  packageJson.scripts = {
    ...packageJson.scripts,
    "dev:all": "bun scripts/dev.ts"
  };

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
  console.log("✓ Added dev:all script to package.json");
}

async function main() {
  try {
    // Check Docker
    try {
      await $`docker --version`.quiet();
    } catch (e) {
      console.error(chalk.red("❌ Docker is required but not found. Please install Docker first."));
      process.exit(1);
    }

    await setupPostgreSQL();
    await setupConvex();
    await updateEnvironmentVariables();
    await createCleanupScript();
    await createDevScript();
    await updatePackageJson();

    console.log(chalk.green.bold("\n🎉 Local development environment is ready!"));
    console.log(chalk.blue("\n📍 Services:"));
    console.log(`• PostgreSQL: ${chalk.cyan("localhost:5432")}`);
    console.log(chalk.blue("\n🚀 Start all development servers:"));
    console.log(`• Run: ${chalk.cyan("bun run dev:all")}`);
    console.log(chalk.blue("\n🔗 Convex setup:"));
    console.log(`• Dashboard: ${chalk.cyan("https://dashboard.convex.dev")}`);
    console.log(`• Run ${chalk.cyan("bunx convex dev")} to start Convex dev server`);
    console.log(chalk.blue("\n🧹 To cleanup:"));
    console.log(`• Run: ${chalk.cyan("bun scripts/cleanup-local.ts")}`);

  } catch (error) {
    console.error(chalk.red(`❌ Setup failed: ${error.message}`));
    process.exit(1);
  }
}

main();