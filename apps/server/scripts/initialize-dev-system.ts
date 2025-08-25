#!/usr/bin/env bun

/**
 * Robust development system initialization script
 * 
 * This script ensures that:
 * 1. Database connection is working
 * 2. All required tables exist with correct schema
 * 3. Development user is created if it doesn't exist
 * 4. Session handling is properly configured
 * 5. The system is ready for dev-login functionality
 * 
 * Safe to run multiple times (idempotent)
 * 
 * Usage: bun run apps/server/scripts/initialize-dev-system.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// Enhanced logger for initialization process
const logger = {
  info: (message: string, context?: any) => {
    console.log(`[INIT] ℹ️  ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  success: (message: string, context?: any) => {
    console.log(`[INIT] ✅ ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  warn: (message: string, context?: any) => {
    console.warn(`[INIT] ⚠️  ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[INIT] ❌ ${message}`);
    if (error) {
      console.error(`[INIT] Error details:`, error);
      if (error.stack) {
        console.error(`[INIT] Stack trace:`, error.stack);
      }
    }
  },
  step: (step: number, total: number, message: string) => {
    console.log(`[INIT] 📋 Step ${step}/${total}: ${message}`);
  }
};

// Development user configuration
const DEV_USER = {
  email: 'dev@openchat.local',
  name: 'Developer User',
  emailVerified: true,
  image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face',
  username: 'dev',
  displayName: 'Dev User 👨‍💻',
  bio: 'Development user for testing and debugging'
};

/**
 * Determines the correct database URL based on environment
 */
function getDatabaseUrl(): string {
  // If explicit DATABASE_URL is provided, use it
  if (process.env.DATABASE_URL) {
    logger.info('Using DATABASE_URL from environment:', process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@'));
    return process.env.DATABASE_URL;
  }

  // Check if we're in Docker environment
  const isDocker = process.env.DOCKER === 'true' || process.env.DATABASE_URL?.includes('postgres:5432');
  
  if (isDocker) {
    const dockerUrl = "postgresql://openchat:openchat_dev@postgres:5432/openchat_dev";
    logger.info('Using Docker networking URL:', dockerUrl.replace(/:[^:]*@/, ':***@'));
    return dockerUrl;
  }

  // Local development fallback
  const localUrl = "postgresql://openchat:openchat_dev@localhost:5432/openchat_dev";
  logger.info('Using localhost fallback URL:', localUrl.replace(/:[^:]*@/, ':***@'));
  return localUrl;
}

/**
 * Create database connection with retry logic
 */
async function createDatabaseConnection(): Promise<{ pool: Pool; db: any }> {
  const connectionString = getDatabaseUrl();
  
  const poolConfig = {
    connectionString,
    max: 5, // Smaller pool for initialization
    min: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    ssl: false,
  };

  const pool = new Pool(poolConfig);
  const db = drizzle(pool);

  // Test connection with retries
  const maxRetries = 5;
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.success('Database connection established');
      return { pool, db };
    } catch (error) {
      attempts++;
      logger.error(`Connection attempt ${attempts}/${maxRetries} failed:`, 
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      if (attempts >= maxRetries) {
        throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
      }
      
      // Exponential backoff
      const delay = 2000 * Math.pow(2, attempts - 1);
      logger.info(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unexpected error in connection loop');
}

/**
 * Check if required tables exist and create them if necessary
 */
async function ensureTablesExist(pool: Pool): Promise<void> {
  const client = await pool.connect();
  
  try {
    logger.info('Checking for required database tables...');

    // Check existing tables
    const existingTablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    const existingTables = existingTablesResult.rows.map(r => r.table_name);
    logger.info('Existing tables:', existingTables);

    const requiredTables = ['user', 'session', 'account', 'conversation', 'message'];
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));

    if (missingTables.length > 0) {
      logger.warn('Missing required tables:', missingTables);
      
      // Create missing tables with basic schema
      if (missingTables.includes('user')) {
        logger.info('Creating user table...');
        await client.query(`
          CREATE TABLE IF NOT EXISTS "user" (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            "emailVerified" BOOLEAN DEFAULT false,
            image TEXT,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
          );
        `);
        logger.success('User table created');
      }

      if (missingTables.includes('session')) {
        logger.info('Creating session table...');
        await client.query(`
          CREATE TABLE IF NOT EXISTS session (
            id TEXT PRIMARY KEY,
            token TEXT UNIQUE NOT NULL,
            "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            "expiresAt" TIMESTAMP NOT NULL,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW(),
            "ipAddress" TEXT,
            "userAgent" TEXT
          );
        `);
        logger.success('Session table created');
      }

      if (missingTables.includes('account')) {
        logger.info('Creating account table...');
        await client.query(`
          CREATE TABLE IF NOT EXISTS account (
            id TEXT PRIMARY KEY,
            "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            provider TEXT NOT NULL,
            "providerId" TEXT NOT NULL,
            "accessToken" TEXT,
            "refreshToken" TEXT,
            "expiresAt" TIMESTAMP,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW(),
            UNIQUE(provider, "providerId")
          );
        `);
        logger.success('Account table created');
      }

      if (missingTables.includes('conversation')) {
        logger.info('Creating conversation table...');
        await client.query(`
          CREATE TABLE IF NOT EXISTS conversation (
            id TEXT PRIMARY KEY,
            title TEXT,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
          );
        `);
        logger.success('Conversation table created');
      }

      if (missingTables.includes('message')) {
        logger.info('Creating message table...');
        await client.query(`
          CREATE TABLE IF NOT EXISTS message (
            id TEXT PRIMARY KEY,
            "conversationId" TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
            "userId" TEXT REFERENCES "user"(id) ON DELETE SET NULL,
            content TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
          );
        `);
        logger.success('Message table created');
      }

      logger.success('All missing tables have been created');
    } else {
      logger.success('All required tables already exist');
    }

  } finally {
    client.release();
  }
}

/**
 * Ensure development user exists
 */
async function ensureDevUserExists(pool: Pool): Promise<any> {
  const client = await pool.connect();
  
  try {
    logger.info('Checking for development user...');

    // Check if dev user already exists
    const existingUserResult = await client.query(
      'SELECT * FROM "user" WHERE email = $1',
      [DEV_USER.email]
    );

    if (existingUserResult.rows.length > 0) {
      const user = existingUserResult.rows[0];
      logger.success('Development user already exists:', {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      });
      return user;
    }

    // Create development user
    logger.info('Creating development user...');
    const userId = nanoid();
    const now = new Date();

    const insertResult = await client.query(`
      INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      userId,
      DEV_USER.name,
      DEV_USER.email,
      DEV_USER.emailVerified,
      DEV_USER.image,
      now,
      now
    ]);

    const newUser = insertResult.rows[0];
    logger.success('Development user created:', {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      createdAt: newUser.createdAt
    });

    return newUser;

  } finally {
    client.release();
  }
}

/**
 * Clean up old development sessions
 */
async function cleanupOldSessions(pool: Pool, userId: string): Promise<void> {
  const client = await pool.connect();
  
  try {
    logger.info('Cleaning up old development sessions...');

    // Delete expired sessions
    const expiredResult = await client.query(
      'DELETE FROM session WHERE "userId" = $1 AND "expiresAt" < NOW()',
      [userId]
    );

    if (expiredResult.rowCount > 0) {
      logger.info(`Removed ${expiredResult.rowCount} expired sessions`);
    }

    // Keep only the 5 most recent sessions for the dev user
    await client.query(`
      DELETE FROM session 
      WHERE "userId" = $1 
      AND id NOT IN (
        SELECT id FROM session 
        WHERE "userId" = $1 
        ORDER BY "createdAt" DESC 
        LIMIT 5
      )
    `, [userId]);

    logger.success('Session cleanup completed');

  } finally {
    client.release();
  }
}

/**
 * Verify system is ready for dev-login
 */
async function verifySystemReadiness(pool: Pool): Promise<boolean> {
  const client = await pool.connect();
  
  try {
    logger.info('Verifying system readiness for dev-login...');

    // Test all critical operations
    const tests = [
      {
        name: 'Database connectivity',
        test: () => client.query('SELECT NOW()')
      },
      {
        name: 'User table access',
        test: () => client.query('SELECT COUNT(*) FROM "user"')
      },
      {
        name: 'Session table access',
        test: () => client.query('SELECT COUNT(*) FROM session')
      },
      {
        name: 'Dev user accessibility',
        test: () => client.query('SELECT id FROM "user" WHERE email = $1', [DEV_USER.email])
      }
    ];

    let allTestsPassed = true;

    for (const test of tests) {
      try {
        await test.test();
        logger.success(`✓ ${test.name}`);
      } catch (error) {
        logger.error(`✗ ${test.name}:`, error);
        allTestsPassed = false;
      }
    }

    if (allTestsPassed) {
      logger.success('System is ready for dev-login functionality');
      return true;
    } else {
      logger.error('System readiness check failed');
      return false;
    }

  } finally {
    client.release();
  }
}

/**
 * Main initialization function
 */
async function initializeDevSystem(): Promise<void> {
  const totalSteps = 6;
  let currentStep = 0;

  try {
    logger.info('🚀 Starting development system initialization...');
    logger.info('Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@') : 'not set',
      DOCKER: process.env.DOCKER,
    });

    // Step 1: Create database connection
    logger.step(++currentStep, totalSteps, 'Establishing database connection');
    const { pool, db } = await createDatabaseConnection();

    // Step 2: Ensure tables exist
    logger.step(++currentStep, totalSteps, 'Ensuring required database tables exist');
    await ensureTablesExist(pool);

    // Step 3: Create development user
    logger.step(++currentStep, totalSteps, 'Ensuring development user exists');
    const devUser = await ensureDevUserExists(pool);

    // Step 4: Clean up old sessions
    logger.step(++currentStep, totalSteps, 'Cleaning up old sessions');
    await cleanupOldSessions(pool, devUser.id);

    // Step 5: Verify system readiness
    logger.step(++currentStep, totalSteps, 'Verifying system readiness');
    const isReady = await verifySystemReadiness(pool);

    if (!isReady) {
      throw new Error('System readiness verification failed');
    }

    // Step 6: Final summary
    logger.step(++currentStep, totalSteps, 'Initialization complete');
    logger.success('🎉 Development system initialization completed successfully!');
    logger.info('Dev-login functionality is now ready to use');
    logger.info('You can now use the dev-login button in the UI or call /api/auth/dev-login directly');

    // Clean shutdown
    await pool.end();

  } catch (error) {
    logger.error('❌ Development system initialization failed:', error);
    
    // Provide helpful error guidance
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        logger.error('💡 SOLUTION: Start PostgreSQL database');
        logger.info('Commands to try:');
        logger.info('  docker-compose up -d postgres');
        logger.info('  # OR');
        logger.info('  docker-compose up postgres');
      } else if (error.message.includes('database') && error.message.includes('does not exist')) {
        logger.error('💡 SOLUTION: Create database or check connection string');
        logger.info('The database specified in DATABASE_URL may not exist');
      } else if (error.message.includes('authentication failed')) {
        logger.error('💡 SOLUTION: Check database credentials');
        logger.info('The username/password in DATABASE_URL may be incorrect');
      }
    }
    
    process.exit(1);
  }
}

// Run initialization if this script is executed directly
if (import.meta.main) {
  initializeDevSystem().catch((error) => {
    logger.error('Unhandled error during initialization:', error);
    process.exit(1);
  });
}

export { initializeDevSystem };