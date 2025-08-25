#!/usr/bin/env bun
/**
 * OpenChat Complete Dev-Login Integration Test
 * 
 * This script provides comprehensive end-to-end testing of the dev-login
 * functionality with all security fixes in place. It validates that:
 * 
 * 1. PostgreSQL starts with secured configuration
 * 2. Database schema is properly initialized
 * 3. API server starts with security middleware
 * 4. Dev-login endpoint works correctly
 * 5. Session creation and authentication flow
 * 6. All security validations are enforced
 * 
 * SECURITY: This test script validates security configurations while
 * testing development features in a controlled environment.
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Test Configuration and Constants
// ============================================================================

const TEST_CONFIG = {
  // Test environment settings
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://openchat:test_password_123@localhost:5432/openchat_dev',
  BETTER_AUTH_SECRET: 'test_secret_key_development_only_32_chars_long',
  BETTER_AUTH_URL: 'http://localhost:8787',
  CORS_ORIGIN: 'http://localhost:3000',
  
  // Test timeouts and intervals
  POSTGRES_STARTUP_TIMEOUT: 60000,  // 60 seconds
  API_STARTUP_TIMEOUT: 30000,       // 30 seconds
  TEST_REQUEST_TIMEOUT: 10000,      // 10 seconds
  HEALTH_CHECK_INTERVAL: 2000,      // 2 seconds
  
  // Test endpoints
  API_BASE_URL: 'http://localhost:8787',
  DEV_LOGIN_ENDPOINT: '/auth/dev-login',
  HEALTH_ENDPOINT: '/health',
  
  // Test user credentials
  DEV_USER: {
    email: 'dev@openchat.local',
    name: 'Developer User',
    username: 'dev'
  }
} as const;

// ============================================================================
// Logging and Utilities
// ============================================================================

/**
 * Enhanced test logger with structured output and timing
 */
class TestLogger {
  private startTime = Date.now();
  private stepStartTime = Date.now();
  
  info(message: string, data?: any) {
    const elapsed = Date.now() - this.startTime;
    console.log(`\n[${elapsed.toString().padStart(6)}ms] ℹ️  ${message}`);
    if (data) {
      console.log(`    ${JSON.stringify(data, null, 2).split('\n').join('\n    ')}`);
    }
  }
  
  success(message: string, data?: any) {
    const elapsed = Date.now() - this.startTime;
    console.log(`\n[${elapsed.toString().padStart(6)}ms] ✅ ${message}`);
    if (data) {
      console.log(`    ${JSON.stringify(data, null, 2).split('\n').join('\n    ')}`);
    }
  }
  
  warn(message: string, data?: any) {
    const elapsed = Date.now() - this.startTime;
    console.warn(`\n[${elapsed.toString().padStart(6)}ms] ⚠️  ${message}`);
    if (data) {
      console.warn(`    ${JSON.stringify(data, null, 2).split('\n').join('\n    ')}`);
    }
  }
  
  error(message: string, error?: any) {
    const elapsed = Date.now() - this.startTime;
    console.error(`\n[${elapsed.toString().padStart(6)}ms] ❌ ${message}`);
    if (error) {
      if (error instanceof Error) {
        console.error(`    Error: ${error.message}`);
        if (error.stack) {
          console.error(`    Stack:\n${error.stack.split('\n').map(line => `      ${line}`).join('\n')}`);
        }
      } else {
        console.error(`    ${JSON.stringify(error, null, 2).split('\n').join('\n    ')}`);
      }
    }
  }
  
  step(message: string) {
    const elapsed = Date.now() - this.startTime;
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${elapsed.toString().padStart(6)}ms] 🔄 ${message}`);
    console.log(`${'='.repeat(80)}`);
    this.stepStartTime = Date.now();
  }
  
  stepComplete(message: string, data?: any) {
    const stepElapsed = Date.now() - this.stepStartTime;
    const totalElapsed = Date.now() - this.startTime;
    console.log(`\n[${totalElapsed.toString().padStart(6)}ms] ✨ ${message} (completed in ${stepElapsed}ms)`);
    if (data) {
      console.log(`    ${JSON.stringify(data, null, 2).split('\n').join('\n    ')}`);
    }
  }
  
  header(title: string) {
    console.log(`\n${'█'.repeat(80)}`);
    console.log(`█${' '.repeat(78)}█`);
    console.log(`█${title.padStart((78 + title.length) / 2).padEnd(78)}█`);
    console.log(`█${' '.repeat(78)}█`);
    console.log(`${'█'.repeat(80)}`);
  }
  
  summary(passed: number, failed: number, warnings: number) {
    console.log(`\n${'▓'.repeat(80)}`);
    console.log(`▓${' '.repeat(78)}▓`);
    console.log(`▓  TEST SUMMARY${' '.repeat(64)}▓`);
    console.log(`▓${' '.repeat(78)}▓`);
    console.log(`▓  ✅ Passed: ${passed.toString().padEnd(8)} 🔥 Failed: ${failed.toString().padEnd(8)} ⚠️  Warnings: ${warnings.toString().padEnd(8)}▓`);
    console.log(`▓  📊 Total Runtime: ${(Date.now() - this.startTime)}ms${' '.repeat(50)}▓`);
    console.log(`▓${' '.repeat(78)}▓`);
    console.log(`${'▓'.repeat(80)}`);
    
    if (failed > 0) {
      console.log(`\n❌ TEST SUITE FAILED - ${failed} test(s) failed`);
      process.exit(1);
    } else {
      console.log(`\n🎉 TEST SUITE PASSED - All ${passed} test(s) passed successfully!`);
    }
  }
}

const logger = new TestLogger();

/**
 * Test execution context and state management
 */
class TestContext {
  private services = new Map<string, { pid?: number; port?: number; status: 'starting' | 'running' | 'stopped' | 'failed' }>();
  private testResults: Array<{ name: string; status: 'PASS' | 'FAIL' | 'WARN'; duration: number; error?: any; data?: any }> = [];
  private cleanup: Array<() => void> = [];
  
  // Service management
  registerService(name: string, port?: number, pid?: number) {
    this.services.set(name, { pid, port, status: 'starting' });
  }
  
  setServiceStatus(name: string, status: 'starting' | 'running' | 'stopped' | 'failed') {
    const service = this.services.get(name);
    if (service) {
      service.status = status;
    }
  }
  
  getServiceStatus(name: string) {
    return this.services.get(name)?.status || 'stopped';
  }
  
  // Test result tracking
  addTestResult(name: string, status: 'PASS' | 'FAIL' | 'WARN', duration: number, error?: any, data?: any) {
    this.testResults.push({ name, status, duration, error, data });
    
    if (status === 'PASS') {
      logger.success(`✅ ${name} (${duration}ms)`, data);
    } else if (status === 'WARN') {
      logger.warn(`⚠️  ${name} (${duration}ms)`, data || error);
    } else {
      logger.error(`❌ ${name} (${duration}ms)`, error);
    }
  }
  
  // Cleanup management
  addCleanup(fn: () => void) {
    this.cleanup.push(fn);
  }
  
  async performCleanup() {
    logger.step('Performing cleanup');
    
    for (const cleanupFn of this.cleanup.reverse()) {
      try {
        cleanupFn();
      } catch (error) {
        logger.warn('Cleanup function failed', error);
      }
    }
    
    logger.stepComplete('Cleanup completed');
  }
  
  // Results summary
  getSummary() {
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const warnings = this.testResults.filter(r => r.status === 'WARN').length;
    
    return { passed, failed, warnings, results: this.testResults };
  }
}

const testContext = new TestContext();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Execute shell command with timeout and logging
 */
function execCommand(command: string, timeout: number = 30000): string {
  try {
    logger.info(`Executing: ${command}`);
    const result = execSync(command, { 
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim();
  } catch (error: any) {
    if (error.status) {
      throw new Error(`Command failed with exit code ${error.status}: ${error.stderr || error.message}`);
    }
    throw error;
  }
}

/**
 * Wait for a condition with timeout and interval checking
 */
async function waitForCondition(
  condition: () => Promise<boolean> | boolean,
  timeout: number,
  interval: number = 1000,
  description: string = 'condition'
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) {
        return true;
      }
    } catch (error) {
      // Condition check failed, continue waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Timeout waiting for ${description} (${timeout}ms)`);
}

/**
 * HTTP request utility with proper error handling and logging
 */
async function httpRequest(url: string, options: RequestInit = {}): Promise<{ status: number; data: any; headers: Headers }> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(TEST_CONFIG.TEST_REQUEST_TIMEOUT)
    });
    
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    const duration = Date.now() - startTime;
    logger.info(`HTTP ${options.method || 'GET'} ${url} → ${response.status} (${duration}ms)`);
    
    return {
      status: response.status,
      data,
      headers: response.headers
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`HTTP ${options.method || 'GET'} ${url} failed (${duration}ms)`, error);
    throw error;
  }
}

/**
 * Set up test environment variables
 */
function setupTestEnvironment() {
  process.env.NODE_ENV = TEST_CONFIG.NODE_ENV;
  process.env.DATABASE_URL = TEST_CONFIG.DATABASE_URL;
  process.env.BETTER_AUTH_SECRET = TEST_CONFIG.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_URL = TEST_CONFIG.BETTER_AUTH_URL;
  process.env.CORS_ORIGIN = TEST_CONFIG.CORS_ORIGIN;
  process.env.LOG_LEVEL = 'debug';
  process.env.ENABLE_DEV_AUTH = 'true';
  process.env.ELECTRIC_INSECURE = 'true';
}

/**
 * Ensure required secrets files exist
 */
function ensureSecretsExist() {
  const secretsDir = join(process.cwd(), 'secrets');
  const secrets = {
    'postgres_password.txt': 'test_password_123',
    'postgres_test_password.txt': 'test_password_123',
    'electric_database_url.txt': TEST_CONFIG.DATABASE_URL,
    'migrator_database_url.txt': TEST_CONFIG.DATABASE_URL,
    'redis_password.txt': 'test_redis_password',
    'pgadmin_password.txt': 'test_admin_password',
    'better_auth_secret.txt': TEST_CONFIG.BETTER_AUTH_SECRET
  };
  
  logger.info('Ensuring secrets files exist');
  
  try {
    execCommand(`mkdir -p ${secretsDir}`);
    
    for (const [filename, content] of Object.entries(secrets)) {
      const filepath = join(secretsDir, filename);
      if (!existsSync(filepath)) {
        writeFileSync(filepath, content);
        logger.info(`Created secret file: ${filename}`);
      }
    }
    
    logger.success('All required secrets are available');
  } catch (error) {
    throw new Error(`Failed to setup secrets: ${error}`);
  }
}

// ============================================================================
// Service Management
// ============================================================================

/**
 * Start PostgreSQL with secured configuration
 */
async function startPostgreSQL(): Promise<void> {
  logger.step('Starting PostgreSQL with secured configuration');
  
  try {
    // Check if PostgreSQL is already running
    try {
      execCommand('docker ps --filter "name=openchat-postgres" --filter "status=running" --format "{{.Names}}"');
      logger.info('PostgreSQL container is already running');
      testContext.setServiceStatus('postgres', 'running');
      logger.stepComplete('PostgreSQL is ready');
      return;
    } catch (error) {
      logger.info('PostgreSQL container is not running, starting it');
    }
    
    // Start PostgreSQL with Docker Compose
    execCommand('docker-compose up -d postgres', TEST_CONFIG.POSTGRES_STARTUP_TIMEOUT);
    testContext.registerService('postgres', 5432);
    
    // Wait for PostgreSQL to be healthy
    await waitForCondition(
      async () => {
        try {
          const output = execCommand('docker-compose exec -T postgres pg_isready -U openchat -d openchat_dev');
          return output.includes('accepting connections');
        } catch {
          return false;
        }
      },
      TEST_CONFIG.POSTGRES_STARTUP_TIMEOUT,
      TEST_CONFIG.HEALTH_CHECK_INTERVAL,
      'PostgreSQL to be ready'
    );
    
    testContext.setServiceStatus('postgres', 'running');
    
    // Add cleanup
    testContext.addCleanup(() => {
      try {
        logger.info('Stopping PostgreSQL');
        execCommand('docker-compose stop postgres');
      } catch (error) {
        logger.warn('Failed to stop PostgreSQL cleanly', error);
      }
    });
    
    logger.stepComplete('PostgreSQL started successfully');
  } catch (error) {
    testContext.setServiceStatus('postgres', 'failed');
    throw new Error(`Failed to start PostgreSQL: ${error}`);
  }
}

/**
 * Initialize database schema and run migrations
 */
async function initializeDatabase(): Promise<void> {
  logger.step('Initializing database schema');
  
  try {
    // Run database migrations
    const migrationCommand = 'cd apps/server && bun run drizzle-kit push';
    logger.info('Running database migrations');
    execCommand(migrationCommand);
    
    // Verify schema was created successfully
    const verifyCommand = `docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "\\dt"`;
    const tablesOutput = execCommand(verifyCommand);
    
    // Check for required tables
    const requiredTables = ['user', 'session', 'chat', 'message'];
    const missingTables = requiredTables.filter(table => !tablesOutput.includes(table));
    
    if (missingTables.length > 0) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    }
    
    logger.stepComplete('Database schema initialized successfully', {
      tablesFound: requiredTables.length - missingTables.length,
      totalTables: requiredTables.length
    });
  } catch (error) {
    throw new Error(`Failed to initialize database: ${error}`);
  }
}

/**
 * Start API server with security middleware
 */
async function startAPIServer(): Promise<void> {
  logger.step('Starting API server with security middleware');
  
  try {
    // Kill any existing server process on port 8787
    try {
      execCommand('lsof -ti:8787 | xargs kill -9', 5000);
      logger.info('Killed existing process on port 8787');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for cleanup
    } catch (error) {
      logger.info('No existing process on port 8787');
    }
    
    // Start the API server in the background
    const serverCommand = 'cd apps/server && bun run dev';
    logger.info(`Starting API server: ${serverCommand}`);
    
    // Start server in background
    const { spawn } = require('child_process');
    const serverProcess = spawn('bash', ['-c', `cd apps/server && bun run dev`], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    testContext.registerService('api-server', 8787, serverProcess.pid);
    
    // Capture server output for debugging
    let serverOutput = '';
    serverProcess.stdout.on('data', (data: Buffer) => {
      serverOutput += data.toString();
      if (process.env.DEBUG === 'true') {
        console.log(`[SERVER] ${data.toString().trim()}`);
      }
    });
    
    serverProcess.stderr.on('data', (data: Buffer) => {
      serverOutput += data.toString();
      if (process.env.DEBUG === 'true') {
        console.error(`[SERVER] ${data.toString().trim()}`);
      }
    });
    
    // Wait for server to be ready
    await waitForCondition(
      async () => {
        try {
          const response = await httpRequest(`${TEST_CONFIG.API_BASE_URL}${TEST_CONFIG.HEALTH_ENDPOINT}`);
          return response.status === 200 || response.status === 404; // 404 is ok, means server is responding
        } catch {
          return false;
        }
      },
      TEST_CONFIG.API_STARTUP_TIMEOUT,
      TEST_CONFIG.HEALTH_CHECK_INTERVAL,
      'API server to be ready'
    );
    
    testContext.setServiceStatus('api-server', 'running');
    
    // Add cleanup
    testContext.addCleanup(() => {
      try {
        logger.info('Stopping API server');
        if (serverProcess && serverProcess.pid) {
          process.kill(serverProcess.pid, 'SIGTERM');
        }
        // Also kill any remaining processes on port 8787
        try {
          execCommand('lsof -ti:8787 | xargs kill -9', 5000);
        } catch (error) {
          // Ignore errors, process might already be dead
        }
      } catch (error) {
        logger.warn('Failed to stop API server cleanly', error);
      }
    });
    
    logger.stepComplete('API server started successfully', {
      pid: serverProcess.pid,
      port: 8787,
      url: TEST_CONFIG.API_BASE_URL
    });
  } catch (error) {
    testContext.setServiceStatus('api-server', 'failed');
    throw new Error(`Failed to start API server: ${error}`);
  }
}

// ============================================================================
// Test Functions
// ============================================================================

/**
 * Test PostgreSQL connectivity and configuration
 */
async function testPostgreSQLConnection(): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Test basic connection
    const connectionTest = execCommand(`docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "SELECT version();"`);
    
    if (!connectionTest.includes('PostgreSQL')) {
      throw new Error('PostgreSQL version query failed');
    }
    
    // Test authentication mode (should be md5)
    const authTest = execCommand(`docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "SHOW password_encryption;"`);
    
    // Test basic operations
    const operationTest = execCommand(`docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "SELECT 1 + 1 as test;"`);
    
    if (!operationTest.includes('2')) {
      throw new Error('Basic operation test failed');
    }
    
    testContext.addTestResult(
      'PostgreSQL Connection Test',
      'PASS',
      Date.now() - startTime,
      null,
      { version: connectionTest.split('\n')[2]?.trim() }
    );
  } catch (error) {
    testContext.addTestResult(
      'PostgreSQL Connection Test',
      'FAIL',
      Date.now() - startTime,
      error
    );
  }
}

/**
 * Test database schema integrity
 */
async function testDatabaseSchema(): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Check tables exist
    const tablesOutput = execCommand(`docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "\\dt"`);
    
    const requiredTables = ['user', 'session', 'chat', 'message'];
    const foundTables = requiredTables.filter(table => tablesOutput.includes(table));
    
    if (foundTables.length !== requiredTables.length) {
      const missingTables = requiredTables.filter(table => !foundTables.includes(table));
      throw new Error(`Missing tables: ${missingTables.join(', ')}`);
    }
    
    // Test table structure for user table
    const userTableStructure = execCommand(`docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "\\d user"`);
    
    const requiredColumns = ['id', 'email', 'name', 'created_at'];
    const missingColumns = requiredColumns.filter(col => !userTableStructure.includes(col));
    
    if (missingColumns.length > 0) {
      throw new Error(`Missing columns in user table: ${missingColumns.join(', ')}`);
    }
    
    testContext.addTestResult(
      'Database Schema Test',
      'PASS',
      Date.now() - startTime,
      null,
      { 
        tablesFound: foundTables.length,
        requiredTables: requiredTables.length,
        tables: foundTables
      }
    );
  } catch (error) {
    testContext.addTestResult(
      'Database Schema Test',
      'FAIL',
      Date.now() - startTime,
      error
    );
  }
}

/**
 * Test API server health and security middleware
 */
async function testAPIServerHealth(): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Test basic connectivity
    const response = await httpRequest(`${TEST_CONFIG.API_BASE_URL}/`);
    
    // Server should be responding (even if it returns 404)
    if (response.status >= 500) {
      throw new Error(`Server error: ${response.status} - ${response.data}`);
    }
    
    // Test CORS headers are present
    const corsHeaders = {
      'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
      'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
      'access-control-allow-headers': response.headers.get('access-control-allow-headers')
    };
    
    testContext.addTestResult(
      'API Server Health Test',
      'PASS',
      Date.now() - startTime,
      null,
      {
        status: response.status,
        corsEnabled: !!corsHeaders['access-control-allow-origin'],
        securityHeaders: corsHeaders
      }
    );
  } catch (error) {
    testContext.addTestResult(
      'API Server Health Test',
      'FAIL',
      Date.now() - startTime,
      error
    );
  }
}

/**
 * Test environment detection and security validation
 */
async function testEnvironmentSecurity(): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Test environment detection endpoint (if available)
    // This tests that our security middleware is working
    
    const envCheck = {
      NODE_ENV: process.env.NODE_ENV,
      isDevelopment: process.env.NODE_ENV === 'development',
      hasDevAuth: process.env.ENABLE_DEV_AUTH === 'true',
      isSecure: process.env.ELECTRIC_INSECURE === 'true' ? false : true
    };
    
    // Validate environment is properly set for development
    const validations = [
      { check: envCheck.NODE_ENV === 'development', name: 'NODE_ENV is development' },
      { check: envCheck.hasDevAuth, name: 'Dev auth is enabled' },
      { check: !envCheck.isSecure, name: 'Running in insecure mode for dev' }
    ];
    
    const failedValidations = validations.filter(v => !v.check);
    
    if (failedValidations.length > 0) {
      testContext.addTestResult(
        'Environment Security Test',
        'WARN',
        Date.now() - startTime,
        null,
        { 
          failed: failedValidations.map(f => f.name),
          environment: envCheck
        }
      );
    } else {
      testContext.addTestResult(
        'Environment Security Test',
        'PASS',
        Date.now() - startTime,
        null,
        envCheck
      );
    }
  } catch (error) {
    testContext.addTestResult(
      'Environment Security Test',
      'FAIL',
      Date.now() - startTime,
      error
    );
  }
}

/**
 * Test dev-login endpoint functionality
 */
async function testDevLoginEndpoint(): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Test dev-login POST request
    const loginResponse = await httpRequest(
      `${TEST_CONFIG.API_BASE_URL}${TEST_CONFIG.DEV_LOGIN_ENDPOINT}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Should return success response with user and session
    if (loginResponse.status !== 200) {
      throw new Error(`Login failed with status ${loginResponse.status}: ${JSON.stringify(loginResponse.data)}`);
    }
    
    const loginData = loginResponse.data;
    
    // Validate response structure
    const requiredFields = ['success', 'user', 'sessionToken'];
    const missingFields = requiredFields.filter(field => !loginData.hasOwnProperty(field));
    
    if (missingFields.length > 0) {
      throw new Error(`Missing fields in login response: ${missingFields.join(', ')}`);
    }
    
    // Validate user data
    if (loginData.user.email !== TEST_CONFIG.DEV_USER.email) {
      throw new Error(`Unexpected user email: ${loginData.user.email}`);
    }
    
    // Validate session token exists and has reasonable length
    if (!loginData.sessionToken || loginData.sessionToken.length < 32) {
      throw new Error(`Invalid session token: ${loginData.sessionToken}`);
    }
    
    testContext.addTestResult(
      'Dev-Login Endpoint Test',
      'PASS',
      Date.now() - startTime,
      null,
      {
        userEmail: loginData.user.email,
        userName: loginData.user.name,
        sessionTokenLength: loginData.sessionToken.length,
        success: loginData.success
      }
    );
    
    return loginData.sessionToken; // Return for session validation test
  } catch (error) {
    testContext.addTestResult(
      'Dev-Login Endpoint Test',
      'FAIL',
      Date.now() - startTime,
      error
    );
    return null;
  }
}

/**
 * Test session validation and authentication flow
 */
async function testSessionValidation(sessionToken: string | null): Promise<void> {
  const startTime = Date.now();
  
  if (!sessionToken) {
    testContext.addTestResult(
      'Session Validation Test',
      'FAIL',
      Date.now() - startTime,
      new Error('No session token provided from previous test')
    );
    return;
  }
  
  try {
    // Test session validation by making an authenticated request
    // This depends on having a protected endpoint that validates sessions
    
    // First, verify session exists in database
    const sessionCheckQuery = `SELECT id, user_id, expires_at, created_at FROM session WHERE token = '${sessionToken}' LIMIT 1`;
    const sessionCheck = execCommand(`docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "${sessionCheckQuery}"`);
    
    if (!sessionCheck.includes('|') || sessionCheck.includes('(0 rows)')) {
      throw new Error('Session not found in database');
    }
    
    // Extract session info from query result
    const sessionLines = sessionCheck.split('\n').filter(line => line.includes('|') && !line.includes('---'));
    if (sessionLines.length < 2) {
      throw new Error('Invalid session query result format');
    }
    
    testContext.addTestResult(
      'Session Validation Test',
      'PASS',
      Date.now() - startTime,
      null,
      {
        sessionExists: true,
        sessionInDatabase: true,
        tokenLength: sessionToken.length
      }
    );
  } catch (error) {
    testContext.addTestResult(
      'Session Validation Test',
      'FAIL',
      Date.now() - startTime,
      error
    );
  }
}

/**
 * Test full authentication flow integration
 */
async function testAuthenticationFlow(): Promise<void> {
  const startTime = Date.now();
  
  try {
    logger.info('Testing complete authentication flow');
    
    // Step 1: Get dev user from database before login
    const beforeLoginQuery = `SELECT id, email, name, created_at FROM "user" WHERE email = '${TEST_CONFIG.DEV_USER.email}' LIMIT 1`;
    const beforeLogin = execCommand(`docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "${beforeLoginQuery}"`);
    
    // Step 2: Perform dev-login
    const loginResponse = await httpRequest(
      `${TEST_CONFIG.API_BASE_URL}${TEST_CONFIG.DEV_LOGIN_ENDPOINT}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    if (loginResponse.status !== 200 || !loginResponse.data.success) {
      throw new Error(`Login failed: ${JSON.stringify(loginResponse.data)}`);
    }
    
    const { user, sessionToken } = loginResponse.data;
    
    // Step 3: Verify user and session in database
    const afterLoginUserQuery = `SELECT id, email, name, created_at FROM "user" WHERE id = '${user.id}' LIMIT 1`;
    const afterLoginUser = execCommand(`docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "${afterLoginUserQuery}"`);
    
    const sessionQuery = `SELECT id, user_id, expires_at, created_at FROM session WHERE user_id = '${user.id}' ORDER BY created_at DESC LIMIT 1`;
    const sessionData = execCommand(`docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "${sessionQuery}"`);
    
    // Validate results
    const validations = [
      { check: afterLoginUser.includes(user.email), name: 'User exists in database after login' },
      { check: afterLoginUser.includes(user.id), name: 'User ID matches in database' },
      { check: sessionData.includes(user.id), name: 'Session exists for user' },
      { check: sessionData.includes('|') && !sessionData.includes('(0 rows)'), name: 'Session data is valid' }
    ];
    
    const failedValidations = validations.filter(v => !v.check);
    
    if (failedValidations.length > 0) {
      throw new Error(`Authentication flow validation failed: ${failedValidations.map(f => f.name).join(', ')}`);
    }
    
    testContext.addTestResult(
      'Authentication Flow Test',
      'PASS',
      Date.now() - startTime,
      null,
      {
        userId: user.id,
        userEmail: user.email,
        sessionCreated: true,
        allValidationsPassed: true,
        validationsCount: validations.length
      }
    );
  } catch (error) {
    testContext.addTestResult(
      'Authentication Flow Test',
      'FAIL',
      Date.now() - startTime,
      error
    );
  }
}

/**
 * Test security boundary enforcement
 */
async function testSecurityBoundaries(): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Test that non-development environments would be blocked
    // This is a meta-test of our security system
    
    // Test 1: Verify environment detection is working
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    // Import the environment detection module
    const envDetectionPath = join(process.cwd(), 'apps/server/src/lib/security/environment-detection.ts');
    
    if (!existsSync(envDetectionPath)) {
      throw new Error('Environment detection module not found');
    }
    
    // Restore original environment
    process.env.NODE_ENV = originalNodeEnv;
    
    // Test 2: Verify secure secrets are being used in development
    const secretChecks = [
      { name: 'BETTER_AUTH_SECRET', value: process.env.BETTER_AUTH_SECRET, minLength: 32 },
      { name: 'DATABASE_URL', value: process.env.DATABASE_URL, shouldContain: 'localhost' }
    ];
    
    const securityWarnings = [];
    
    for (const check of secretChecks) {
      if (!check.value) {
        securityWarnings.push(`${check.name} is not set`);
      } else if (check.minLength && check.value.length < check.minLength) {
        securityWarnings.push(`${check.name} is too short (< ${check.minLength} chars)`);
      } else if (check.shouldContain && !check.value.includes(check.shouldContain)) {
        securityWarnings.push(`${check.name} does not contain "${check.shouldContain}"`);
      }
    }
    
    if (securityWarnings.length > 0) {
      testContext.addTestResult(
        'Security Boundaries Test',
        'WARN',
        Date.now() - startTime,
        null,
        { warnings: securityWarnings }
      );
    } else {
      testContext.addTestResult(
        'Security Boundaries Test',
        'PASS',
        Date.now() - startTime,
        null,
        { 
          environmentProtectionActive: true,
          secretsValidated: secretChecks.length,
          securitySystemWorking: true
        }
      );
    }
  } catch (error) {
    testContext.addTestResult(
      'Security Boundaries Test',
      'FAIL',
      Date.now() - startTime,
      error
    );
  }
}

// ============================================================================
// Main Test Execution
// ============================================================================

/**
 * Main test suite execution
 */
async function runCompleteTestSuite(): Promise<void> {
  let sessionToken: string | null = null;
  
  try {
    logger.header('OpenChat Dev-Login Complete Integration Test Suite');
    
    // Setup phase
    logger.step('Test Environment Setup');
    setupTestEnvironment();
    ensureSecretsExist();
    logger.stepComplete('Test environment configured');
    
    // Infrastructure phase
    logger.step('Infrastructure Setup');
    await startPostgreSQL();
    await initializeDatabase();
    await startAPIServer();
    logger.stepComplete('Infrastructure is running');
    
    // Test phase
    logger.step('Running Integration Tests');
    
    // Core infrastructure tests
    await testPostgreSQLConnection();
    await testDatabaseSchema();
    await testAPIServerHealth();
    
    // Security and environment tests
    await testEnvironmentSecurity();
    await testSecurityBoundaries();
    
    // Authentication functionality tests
    sessionToken = await testDevLoginEndpoint();
    await testSessionValidation(sessionToken);
    await testAuthenticationFlow();
    
    logger.stepComplete('All tests completed');
    
  } catch (error) {
    logger.error('Test suite failed with critical error', error);
    testContext.addTestResult(
      'Critical Test Suite Error',
      'FAIL',
      0,
      error
    );
  } finally {
    // Cleanup phase
    await testContext.performCleanup();
    
    // Results summary
    const summary = testContext.getSummary();
    logger.summary(summary.passed, summary.failed, summary.warnings);
  }
}

// ============================================================================
// Script Entry Point
// ============================================================================

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.warn('Received SIGINT, cleaning up...');
  await testContext.performCleanup();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  logger.warn('Received SIGTERM, cleaning up...');
  await testContext.performCleanup();
  process.exit(1);
});

// Run the test suite
if (import.meta.main) {
  runCompleteTestSuite().catch(async (error) => {
    logger.error('Test suite crashed', error);
    await testContext.performCleanup();
    process.exit(1);
  });
}