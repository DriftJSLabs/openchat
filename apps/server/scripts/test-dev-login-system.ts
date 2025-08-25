#!/usr/bin/env bun

/**
 * Comprehensive test script for the dev-login system
 * 
 * This script tests:
 * 1. Database connectivity and schema validation
 * 2. Development user creation and retrieval
 * 3. Session creation and management
 * 4. Full dev-login HTTP endpoint flow
 * 5. Cookie handling and authentication state
 * 
 * Usage: bun run apps/server/scripts/test-dev-login-system.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";

// Enhanced logger for test operations
const logger = {
  info: (message: string, context?: any) => {
    console.log(`[TEST] ℹ️  ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  success: (message: string, context?: any) => {
    console.log(`[TEST] ✅ ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  warn: (message: string, context?: any) => {
    console.warn(`[TEST] ⚠️  ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[TEST] ❌ ${message}`);
    if (error) {
      console.error(`[TEST] Error details:`, error);
      if (error.stack) {
        console.error(`[TEST] Stack trace:`, error.stack);
      }
    }
  },
  test: (testName: string, passed: boolean, details?: string) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[TEST] ${status} ${testName}${details ? ': ' + details : ''}`);
  },
  section: (sectionName: string) => {
    console.log(`\n[TEST] 📋 ${sectionName}`);
    console.log('='.repeat(60));
  }
};

/**
 * Test results tracking
 */
interface TestResult {
  testName: string;
  passed: boolean;
  details?: string;
  error?: any;
  duration?: number;
}

class TestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  startTest(testName: string): void {
    this.startTime = Date.now();
  }

  endTest(testName: string, passed: boolean, details?: string, error?: any): void {
    const duration = Date.now() - this.startTime;
    this.results.push({
      testName,
      passed,
      details,
      error,
      duration
    });
    logger.test(testName, passed, details);
  }

  getSummary(): { passed: number; failed: number; total: number; results: TestResult[] } {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    return {
      passed,
      failed,
      total: this.results.length,
      results: this.results
    };
  }
}

/**
 * Get database connection details
 */
function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const isDocker = process.env.DOCKER === 'true' || process.env.DATABASE_URL?.includes('postgres:5432');
  
  if (isDocker) {
    return "postgresql://openchat:openchat_dev@postgres:5432/openchat_dev";
  }

  return "postgresql://openchat:openchat_dev@localhost:5432/openchat_dev";
}

/**
 * Test 1: Database connectivity and health
 */
async function testDatabaseConnectivity(runner: TestRunner): Promise<Pool | null> {
  runner.startTest('Database Connectivity');
  
  try {
    const connectionString = getDatabaseUrl();
    const pool = new Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 10000,
      ssl: false,
    });

    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as postgres_version');
    client.release();

    runner.endTest('Database Connectivity', true, 
      `Connected to PostgreSQL at ${new Date(result.rows[0].current_time).toISOString()}`
    );
    
    return pool;
  } catch (error) {
    runner.endTest('Database Connectivity', false, 
      'Failed to connect to database', error
    );
    return null;
  }
}

/**
 * Test 2: Schema validation
 */
async function testSchemaValidation(runner: TestRunner, pool: Pool): Promise<boolean> {
  runner.startTest('Database Schema Validation');
  
  try {
    const client = await pool.connect();
    
    // Check for required tables
    const tableResult = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('user', 'session', 'account')
      ORDER BY table_name
    `);
    
    const foundTables = tableResult.rows.map(r => r.table_name);
    const requiredTables = ['user', 'session'];
    const missingTables = requiredTables.filter(t => !foundTables.includes(t));
    
    client.release();
    
    if (missingTables.length === 0) {
      runner.endTest('Database Schema Validation', true, 
        `All required tables found: ${foundTables.join(', ')}`
      );
      return true;
    } else {
      runner.endTest('Database Schema Validation', false, 
        `Missing tables: ${missingTables.join(', ')}`
      );
      return false;
    }
  } catch (error) {
    runner.endTest('Database Schema Validation', false, 
      'Failed to validate schema', error
    );
    return false;
  }
}

/**
 * Test 3: Development user operations
 */
async function testDevUserOperations(runner: TestRunner, pool: Pool): Promise<any> {
  runner.startTest('Development User Operations');
  
  try {
    const client = await pool.connect();
    
    // Check if dev user exists
    const userResult = await client.query(
      'SELECT * FROM "user" WHERE email = $1',
      ['dev@openchat.local']
    );
    
    let devUser = userResult.rows[0];
    
    if (!devUser) {
      runner.endTest('Development User Operations', false, 
        'Development user not found - run initialization script first'
      );
      client.release();
      return null;
    }
    
    // Validate user data
    const hasRequiredFields = devUser.id && devUser.email && devUser.name;
    
    client.release();
    
    if (hasRequiredFields) {
      runner.endTest('Development User Operations', true, 
        `Dev user found: ${devUser.name} (${devUser.email})`
      );
      return devUser;
    } else {
      runner.endTest('Development User Operations', false, 
        'Dev user exists but missing required fields'
      );
      return null;
    }
  } catch (error) {
    runner.endTest('Development User Operations', false, 
      'Failed to validate dev user', error
    );
    return null;
  }
}

/**
 * Test 4: Session creation and management
 */
async function testSessionOperations(runner: TestRunner, pool: Pool, userId: string): Promise<string | null> {
  runner.startTest('Session Creation and Management');
  
  try {
    const client = await pool.connect();
    
    // Create a test session
    const sessionId = `test-session-${Date.now()}`;
    const sessionToken = `test-token-${Math.random().toString(36).substring(2)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const now = new Date();
    
    await client.query(`
      INSERT INTO session (id, token, "userId", "expiresAt", "createdAt", "updatedAt", "ipAddress", "userAgent")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      sessionId,
      sessionToken,
      userId,
      expiresAt,
      now,
      now,
      'test-ip',
      'test-agent'
    ]);
    
    // Verify session was created
    const sessionResult = await client.query(
      'SELECT * FROM session WHERE token = $1',
      [sessionToken]
    );
    
    const session = sessionResult.rows[0];
    
    // Clean up test session
    await client.query(
      'DELETE FROM session WHERE id = $1',
      [sessionId]
    );
    
    client.release();
    
    if (session && session.userId === userId) {
      runner.endTest('Session Creation and Management', true, 
        `Session created and verified for user ${userId}`
      );
      return sessionToken;
    } else {
      runner.endTest('Session Creation and Management', false, 
        'Session creation or verification failed'
      );
      return null;
    }
  } catch (error) {
    runner.endTest('Session Creation and Management', false, 
      'Failed to test session operations', error
    );
    return null;
  }
}

/**
 * Test 5: Dev-login library functions
 */
async function testDevLoginLibrary(runner: TestRunner): Promise<boolean> {
  runner.startTest('Dev-Login Library Functions');
  
  try {
    // Import dev-auth functions
    const { isDevelopment, getOrCreateDevUser, createDevSession, handleDevAutoLogin } = 
      await import('../src/lib/dev-auth.js');
    
    // Test environment detection
    const isDevEnv = isDevelopment();
    if (!isDevEnv) {
      runner.endTest('Dev-Login Library Functions', false, 
        'Not in development environment - dev-login functions will not work'
      );
      return false;
    }
    
    // Test dev user creation/retrieval
    const devUser = await getOrCreateDevUser();
    if (!devUser || !devUser.id) {
      runner.endTest('Dev-Login Library Functions', false, 
        'Failed to get or create dev user'
      );
      return false;
    }
    
    // Test session creation
    const sessionToken = await createDevSession(devUser.id);
    if (!sessionToken) {
      runner.endTest('Dev-Login Library Functions', false, 
        'Failed to create dev session'
      );
      return false;
    }
    
    // Test full auto-login flow
    const autoLoginResult = await handleDevAutoLogin();
    if (!autoLoginResult || !autoLoginResult.user || !autoLoginResult.sessionToken) {
      runner.endTest('Dev-Login Library Functions', false, 
        'Failed to complete auto-login flow'
      );
      return false;
    }
    
    runner.endTest('Dev-Login Library Functions', true, 
      `All library functions working correctly`
    );
    return true;
  } catch (error) {
    runner.endTest('Dev-Login Library Functions', false, 
      'Failed to test library functions', error
    );
    return false;
  }
}

/**
 * Test 6: HTTP endpoint functionality
 */
async function testHttpEndpoint(runner: TestRunner): Promise<boolean> {
  runner.startTest('HTTP Endpoint Functionality');
  
  try {
    // Test assumes the server is running on default port
    const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';
    const endpointUrl = `${serverUrl}/api/auth/dev-login`;
    
    logger.info(`Testing endpoint at: ${endpointUrl}`);
    
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      runner.endTest('HTTP Endpoint Functionality', false, 
        `HTTP ${response.status}: ${errorText}`
      );
      return false;
    }
    
    const result = await response.json();
    
    if (result.success && result.user) {
      // Check for session cookie
      const cookies = response.headers.get('set-cookie') || '';
      const hasSessionCookie = cookies.includes('better-auth.session_token');
      
      runner.endTest('HTTP Endpoint Functionality', true, 
        `Endpoint returned success with user ${result.user.email}${hasSessionCookie ? ' and session cookie' : ''}`
      );
      return true;
    } else {
      runner.endTest('HTTP Endpoint Functionality', false, 
        `Endpoint returned: ${JSON.stringify(result)}`
      );
      return false;
    }
  } catch (error) {
    runner.endTest('HTTP Endpoint Functionality', false, 
      'Failed to test HTTP endpoint - is the server running?', error
    );
    return false;
  }
}

/**
 * Test 7: Environment configuration validation
 */
async function testEnvironmentConfiguration(runner: TestRunner): Promise<boolean> {
  runner.startTest('Environment Configuration');
  
  try {
    const envChecks = {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Not set',
      ELECTRIC_INSECURE: process.env.ELECTRIC_INSECURE,
      DEV_MODE: process.env.DEV_MODE,
      DOCKER: process.env.DOCKER,
    };
    
    // Check if environment is suitable for dev-login
    const isDevMode = process.env.NODE_ENV === 'development' || 
                      process.env.ELECTRIC_INSECURE === 'true' ||
                      process.env.DEV_MODE === 'true';
    
    if (isDevMode) {
      runner.endTest('Environment Configuration', true, 
        `Development environment detected: ${JSON.stringify(envChecks)}`
      );
      return true;
    } else {
      runner.endTest('Environment Configuration', false, 
        `Not in development mode: ${JSON.stringify(envChecks)}`
      );
      return false;
    }
  } catch (error) {
    runner.endTest('Environment Configuration', false, 
      'Failed to validate environment', error
    );
    return false;
  }
}

/**
 * Main test runner function
 */
async function runDevLoginSystemTests(): Promise<void> {
  const runner = new TestRunner();
  
  logger.info('🧪 Starting comprehensive dev-login system tests...');
  logger.info('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@') : 'not set',
    SERVER_URL: process.env.SERVER_URL || 'http://localhost:3001 (default)',
  });

  try {
    // Test 1: Database connectivity
    logger.section('Database Connectivity Tests');
    const pool = await testDatabaseConnectivity(runner);
    if (!pool) {
      logger.error('Cannot continue without database connection');
      return;
    }

    // Test 2: Schema validation
    logger.section('Database Schema Tests');
    const schemaValid = await testSchemaValidation(runner, pool);
    if (!schemaValid) {
      logger.warn('Schema validation failed - some tests may fail');
    }

    // Test 3: Dev user operations
    logger.section('Development User Tests');
    const devUser = await testDevUserOperations(runner, pool);
    
    // Test 4: Session operations
    if (devUser) {
      logger.section('Session Management Tests');
      await testSessionOperations(runner, pool, devUser.id);
    }

    // Test 5: Dev-login library functions
    logger.section('Dev-Login Library Tests');
    await testDevLoginLibrary(runner);

    // Test 6: HTTP endpoint
    logger.section('HTTP Endpoint Tests');
    await testHttpEndpoint(runner);

    // Test 7: Environment configuration
    logger.section('Environment Configuration Tests');
    await testEnvironmentConfiguration(runner);

    // Clean up database connection
    await pool.end();

    // Generate final report
    logger.section('Test Results Summary');
    const summary = runner.getSummary();
    
    logger.info(`Total Tests: ${summary.total}`);
    logger.success(`Passed: ${summary.passed}`);
    if (summary.failed > 0) {
      logger.error(`Failed: ${summary.failed}`);
    }
    
    const successRate = Math.round((summary.passed / summary.total) * 100);
    logger.info(`Success Rate: ${successRate}%`);
    
    if (summary.failed === 0) {
      logger.success('🎉 All tests passed! Dev-login system is fully functional.');
      logger.info('You can now:');
      logger.info('  • Use the dev-login button in the UI');
      logger.info('  • Call /api/auth/dev-login endpoint directly');
      logger.info('  • Authenticate as dev@openchat.local');
    } else {
      logger.error('❌ Some tests failed. Please check the issues above.');
      logger.info('Common solutions:');
      logger.info('  • Run: bun run apps/server/scripts/initialize-dev-system.ts');
      logger.info('  • Ensure PostgreSQL is running: docker-compose up -d postgres');
      logger.info('  • Check DATABASE_URL environment variable');
      logger.info('  • Ensure you\'re in development mode');
    }

    // Detailed failure analysis
    if (summary.failed > 0) {
      logger.section('Failed Tests Details');
      summary.results
        .filter(r => !r.passed)
        .forEach(result => {
          logger.error(`❌ ${result.testName}: ${result.details || 'Unknown error'}`);
          if (result.error) {
            logger.info(`   Error: ${result.error.message || result.error}`);
          }
        });
    }

  } catch (error) {
    logger.error('Unexpected error during testing:', error);
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (import.meta.main) {
  runDevLoginSystemTests().catch((error) => {
    logger.error('Unhandled error during testing:', error);
    process.exit(1);
  });
}

export { runDevLoginSystemTests };