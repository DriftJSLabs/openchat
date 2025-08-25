/**
 * Database Seed Scripts for OpenChat
 * 
 * This module provides utilities for seeding the database with initial data
 * for development, testing, and demonstration purposes.
 * 
 * Usage:
 *   bun src/db/seeds/index.ts --env development
 *   bun src/db/seeds/index.ts --env test
 *   bun src/db/seeds/index.ts --env demo
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import chalk from "chalk";
import { nanoid } from "nanoid";

// Import schema definitions
import * as authSchema from "../schema/auth";
import * as chatSchema from "../schema/chat";

// Seed data modules
import { seedUsers } from "./users";
import { seedChats } from "./chats";
import { seedMessages } from "./messages";

interface SeedOptions {
  environment: 'development' | 'test' | 'demo';
  reset: boolean;
  verbose: boolean;
}

/**
 * Parse command line arguments for seed configuration
 */
function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  
  return {
    environment: (args.find(arg => arg.startsWith('--env='))?.split('=')[1] as SeedOptions['environment']) || 'development',
    reset: args.includes('--reset'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };
}

/**
 * Get database URL based on environment
 */
function getDatabaseUrl(env: string): string {
  switch (env) {
    case 'test':
      return process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://openchat:openchat_test@localhost:5432/openchat_test';
    case 'demo':
      return process.env.DEMO_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://openchat:openchat_dev@localhost:5432/openchat_dev';
    default:
      return process.env.DATABASE_URL || 'postgresql://openchat:openchat_dev@localhost:5432/openchat_dev';
  }
}

/**
 * Log seeding progress with consistent formatting
 */
function log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const icons = {
    info: '📦',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  };
  
  const colors = {
    info: chalk.blue,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red
  };
  
  console.log(colors[type](`${icons[type]} ${message}`));
}

/**
 * Clear all existing data from tables (cascade delete)
 */
async function clearTables(db: any, options: SeedOptions): Promise<void> {
  if (!options.reset) return;
  
  log('Clearing existing data...', 'warning');
  
  try {
    // Clear tables in reverse dependency order
    // Note: Skip message clearing for now since table structure is being updated
    await db.delete(chatSchema.chat);
    await db.delete(authSchema.user);
    
    log('Existing data cleared', 'success');
  } catch (error) {
    log(`Failed to clear tables: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Seed database with initial data based on environment
 */
async function seedDatabase(options: SeedOptions): Promise<void> {
  const databaseUrl = getDatabaseUrl(options.environment);
  
  if (options.verbose) {
    log(`Connecting to database: ${databaseUrl.replace(/\/\/.*@/, '//***@')}`, 'info');
  }
  
  // Create database connection
  const connection = postgres(databaseUrl, {
    max: 1,
    onnotice: options.verbose ? console.log : () => {}
  });
  
  const db = drizzle(connection, {
    schema: { ...authSchema, ...chatSchema },
    logger: options.verbose
  });
  
  try {
    // Clear existing data if reset is requested
    await clearTables(db, options);
    
    // Seed data based on environment
    switch (options.environment) {
      case 'test':
        await seedTestData(db, options);
        break;
      case 'demo':
        await seedDemoData(db, options);
        break;
      default:
        await seedDevelopmentData(db, options);
        break;
    }
    
    log(`Database seeding completed for ${options.environment} environment`, 'success');
    
  } catch (error) {
    log(`Database seeding failed: ${error.message}`, 'error');
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Seed minimal data for testing environment
 */
async function seedTestData(db: any, options: SeedOptions): Promise<void> {
  log('Seeding test data...', 'info');
  
  // Create minimal test data
  const testUsers = await seedUsers(db, {
    count: 2,
    environment: 'test'
  });
  
  const testChats = await seedChats(db, {
    count: 1,
    users: testUsers,
    environment: 'test'
  });
  
  await seedMessages(db, {
    count: 3,
    chats: testChats,
    users: testUsers,
    environment: 'test'
  });
  
  if (options.verbose) {
    log('Test data: 2 users, 1 chat, 3 messages', 'success');
  }
}

/**
 * Seed rich demo data for demonstrations
 */
async function seedDemoData(db: any, options: SeedOptions): Promise<void> {
  log('Seeding demo data...', 'info');
  
  // Create comprehensive demo data
  const demoUsers = await seedUsers(db, {
    count: 10,
    environment: 'demo'
  });
  
  const demoChats = await seedChats(db, {
    count: 8,
    users: demoUsers,
    environment: 'demo'
  });
  
  await seedMessages(db, {
    count: 50,
    chats: demoChats,
    users: demoUsers,
    environment: 'demo'
  });
  
  if (options.verbose) {
    log('Demo data: 10 users, 8 chats, 50 messages', 'success');
  }
}

/**
 * Seed development data
 */
async function seedDevelopmentData(db: any, options: SeedOptions): Promise<void> {
  log('Seeding development data...', 'info');
  
  // Create moderate development data
  const devUsers = await seedUsers(db, {
    count: 5,
    environment: 'development'
  });
  
  const devChats = await seedChats(db, {
    count: 4,
    users: devUsers,
    environment: 'development'
  });
  
  await seedMessages(db, {
    count: 20,
    chats: devChats,
    users: devUsers,
    environment: 'development'
  });
  
  if (options.verbose) {
    log('Development data: 5 users, 4 chats, 20 messages', 'success');
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const options = parseArgs();
  const startTime = Date.now();
  
  console.log(chalk.blue.bold(`🌱 OpenChat Database Seeding (${options.environment})
`));
  
  if (options.verbose) {
    log('Seeding options:', 'info');
    log(`  Environment: ${options.environment}`, 'info');
    log(`  Reset existing data: ${options.reset}`, 'info');
    log(`  Verbose logging: ${options.verbose}`, 'info');
  }
  
  try {
    await seedDatabase(options);
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log('\n' + chalk.green.bold(`🎉 Database seeding completed in ${elapsed}s!`));
    
  } catch (error) {
    console.error('\n' + chalk.red.bold('❌ Database seeding failed!'));
    console.error(chalk.red(error.message));
    
    if (options.verbose) {
      console.error('\nFull error:', error);
    }
    
    process.exit(1);
  }
}

// Run seeding if this file is executed directly
if (import.meta.main) {
  main();
}

export { seedDatabase, seedTestData, seedDemoData, seedDevelopmentData };