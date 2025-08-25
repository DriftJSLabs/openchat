
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, PoolConfig } from "pg";
import * as authSchema from "./schema/auth";
import * as chatSchema from "./schema/chat";
import * as validationSchemas from "./schema/validation";

/**
 * PostgreSQL database configuration and connection setup
 * Uses environment variables for connection string with fallback for development
 * Supports both Docker networking and local development
 */

// Environment detection
const isDev = process.env.NODE_ENV === 'development';
const isDocker = process.env.DOCKER === 'true' || process.env.DATABASE_URL?.includes('postgres:5432');

// Logger for database operations
const logger = {
  info: (message: string, ...args: any[]) => {
    if (isDev) console.log(`[DB] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[DB] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[DB] ${message}`, ...args);
  },
};

/**
 * Determines the correct database URL based on environment
 * Prioritizes Docker networking when running in containers
 */
function getDatabaseUrl(): string {
  // If explicit DATABASE_URL is provided, use it
  if (process.env.DATABASE_URL) {
    logger.info('Using DATABASE_URL from environment:', process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@'));
    return process.env.DATABASE_URL;
  }

  // For Docker environments, use container hostnames
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
 * Connection pool configuration with retry logic and better error handling
 */
const poolConfig: PoolConfig = {
  connectionString: getDatabaseUrl(),
  max: 20, // Maximum number of clients in the pool
  min: 2, // Minimum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 10000, // How long to wait for a connection (increased for Docker)
  acquireTimeoutMillis: 60000, // Max time to wait for a connection from the pool
  ssl: false, // Disable SSL for local development
  keepAlive: true, // Keep TCP connections alive
  keepAliveInitialDelayMillis: 10000, // Initial delay for keepalive
};

// Create PostgreSQL connection pool with enhanced configuration
const pool = new Pool(poolConfig);

// Pool event handlers for better debugging
pool.on('connect', (client) => {
  logger.info('Database pool: New client connected');
  client.query('SET application_name = $1', ['openchat-server']);
});

pool.on('acquire', () => {
  logger.info('Database pool: Client acquired from pool');
});

pool.on('remove', () => {
  logger.info('Database pool: Client removed from pool');
});

pool.on('error', (err, client) => {
  logger.error('Database pool: Unexpected error on idle client', err);
});

/**
 * Connection retry logic with exponential backoff
 */
let connectionAttempts = 0;
const maxRetries = 5;
const retryDelayMs = 2000;

async function testConnection(): Promise<void> {
  while (connectionAttempts < maxRetries) {
    try {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('✅ Database connection established successfully');
      return;
    } catch (error) {
      connectionAttempts++;
      logger.error(`❌ Database connection attempt ${connectionAttempts}/${maxRetries} failed:`, 
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      if (connectionAttempts >= maxRetries) {
        logger.error('💥 Maximum database connection retries exceeded');
        throw new Error(`Failed to connect to database after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Exponential backoff
      const delay = retryDelayMs * Math.pow(2, connectionAttempts - 1);
      logger.info(`⏳ Retrying database connection in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Initialize connection test
testConnection().catch(err => {
  logger.error('Failed to establish initial database connection:', err);
});

/**
 * Drizzle ORM database instance with all schemas
 * Includes authentication, chat, and validation schemas
 */
export const db = drizzle(pool, { 
  schema: { ...authSchema, ...chatSchema } 
});

/**
 * Connection pool instance for direct database operations
 * Use sparingly - prefer using the drizzle instance above
 */
export { pool };

// Export all schema definitions and types
export * from "./schema/auth";
export * from "./schema/chat";

// Export validation schemas for API endpoints and data validation
export { validationSchemas };

// Export commonly used types for convenience
export type {
  // Core chat types
  Conversation,
  ConversationParticipant,
  Message,
  Attachment,
  UserRelationship,
  
  // Insert types
  InsertConversation,
  InsertConversationParticipant,
  InsertMessage,
  InsertAttachment,
  InsertUserRelationship,
} from "./schema/chat";

export type {
  User,
  Session,
  Account,
  Verification,
} from "./schema/auth";

/**
 * Enhanced database health check function
 * Provides detailed information about database connectivity and performance
 * Useful for monitoring, health endpoints, and debugging
 */
export const checkDatabaseHealth = async () => {
  const startTime = Date.now();
  try {
    // Test basic connectivity
    const client = await pool.connect();
    
    // Run multiple diagnostic queries
    const [timeResult, versionResult, poolResult] = await Promise.all([
      client.query('SELECT NOW() as current_time'),
      client.query('SELECT version() as postgres_version'),
      client.query('SELECT count(*) as connection_count FROM pg_stat_activity WHERE datname = current_database()')
    ]);
    
    client.release();
    
    const responseTime = Date.now() - startTime;
    
    return {
      healthy: true,
      timestamp: timeResult.rows[0].current_time,
      responseTime: `${responseTime}ms`,
      postgresVersion: versionResult.rows[0].postgres_version,
      activeConnections: parseInt(poolResult.rows[0].connection_count),
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
      environment: {
        isDevelopment: isDev,
        isDocker: isDocker,
        nodeEnv: process.env.NODE_ENV,
      }
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Database health check failed:', error);
    
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: error instanceof Error && 'code' in error ? error.code : 'UNKNOWN',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
    };
  }
};

/**
 * Test database operations with comprehensive error reporting
 * Useful for debugging connection issues and verifying schema
 */
export const testDatabaseOperations = async () => {
  const tests = [];
  
  try {
    // Test 1: Basic connectivity
    const client = await pool.connect();
    tests.push({ name: 'Database Connection', status: 'PASS', details: 'Successfully connected to database' });
    
    try {
      // Test 2: Basic query
      await client.query('SELECT 1 as test');
      tests.push({ name: 'Basic Query', status: 'PASS', details: 'Simple SELECT query executed successfully' });
      
      // Test 3: Schema validation - check if auth tables exist
      const authTableResult = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name IN ('user', 'session', 'account')
        ORDER BY table_name
      `);
      
      if (authTableResult.rows.length >= 2) {
        tests.push({ 
          name: 'Auth Schema', 
          status: 'PASS', 
          details: `Found auth tables: ${authTableResult.rows.map(r => r.table_name).join(', ')}` 
        });
      } else {
        tests.push({ 
          name: 'Auth Schema', 
          status: 'WARN', 
          details: `Missing auth tables. Found: ${authTableResult.rows.map(r => r.table_name).join(', ')}` 
        });
      }
      
      // Test 4: Chat schema validation
      const chatTableResult = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name IN ('conversation', 'message')
        ORDER BY table_name
      `);
      
      if (chatTableResult.rows.length >= 2) {
        tests.push({ 
          name: 'Chat Schema', 
          status: 'PASS', 
          details: `Found chat tables: ${chatTableResult.rows.map(r => r.table_name).join(', ')}` 
        });
      } else {
        tests.push({ 
          name: 'Chat Schema', 
          status: 'WARN', 
          details: `Missing chat tables. Found: ${chatTableResult.rows.map(r => r.table_name).join(', ')}` 
        });
      }
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    tests.push({ 
      name: 'Database Connection', 
      status: 'FAIL', 
      details: error instanceof Error ? error.message : 'Unknown error',
      error: error
    });
    logger.error('Database operations test failed:', error);
  }
  
  return {
    timestamp: new Date().toISOString(),
    overallStatus: tests.every(t => t.status === 'PASS') ? 'PASS' : 
                   tests.some(t => t.status === 'FAIL') ? 'FAIL' : 'WARN',
    tests,
    summary: {
      passed: tests.filter(t => t.status === 'PASS').length,
      warnings: tests.filter(t => t.status === 'WARN').length,
      failed: tests.filter(t => t.status === 'FAIL').length,
      total: tests.length,
    }
  };
};

/**
 * Graceful database connection cleanup with enhanced error handling
 * Should be called during application shutdown
 */
export const closeDatabaseConnections = async () => {
  try {
    logger.info('Initiating graceful database connection shutdown...');
    
    // Wait for active queries to complete with timeout
    const shutdownTimeout = 10000; // 10 seconds
    const shutdownPromise = pool.end();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database shutdown timeout')), shutdownTimeout)
    );
    
    await Promise.race([shutdownPromise, timeoutPromise]);
    logger.info('✅ Database connections closed successfully');
    
  } catch (error) {
    logger.error('❌ Error during database shutdown:', error);
    
    // Force close if graceful shutdown fails
    try {
      await pool.end();
      logger.info('✅ Force closed database connections');
    } catch (forceError) {
      logger.error('❌ Failed to force close database connections:', forceError);
    }
  }
};

// Process shutdown handlers for graceful cleanup
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down database connections...');
  await closeDatabaseConnections();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down database connections...');
  await closeDatabaseConnections();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception, shutting down database connections:', error);
  await closeDatabaseConnections();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  await closeDatabaseConnections();
  process.exit(1);
});
