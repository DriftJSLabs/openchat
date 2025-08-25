#!/usr/bin/env bun
/**
 * Database Connection Test Utility
 * 
 * This script provides comprehensive database connectivity testing
 * for the OpenChat application. It verifies:
 * - Database connectivity with different connection strings
 * - Schema validation and table existence
 * - Basic CRUD operations
 * - Development user creation/retrieval
 * - Session management functionality
 * 
 * Usage:
 *   bun test-db-connection.ts [--host=localhost|postgres] [--verbose] [--fix-schema]
 */

import { checkDatabaseHealth, testDatabaseOperations, db } from './apps/server/src/db';
import { getOrCreateDevUser, createDevSession, handleDevAutoLogin } from './apps/server/src/lib/dev-auth';

// Command line argument parsing
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const fixSchema = args.includes('--fix-schema');
const hostArg = args.find(arg => arg.startsWith('--host='));
const testHost = hostArg ? hostArg.split('=')[1] : null;

// Enhanced logger with color coding
const logger = {
  info: (message: string, data?: any) => {
    console.log(`\u001b[36m[INFO]\u001b[0m ${message}`);
    if (verbose && data) console.log('  ', JSON.stringify(data, null, 2));
  },
  success: (message: string, data?: any) => {
    console.log(`\u001b[32m[SUCCESS]\u001b[0m ${message}`);
    if (verbose && data) console.log('  ', JSON.stringify(data, null, 2));
  },
  warn: (message: string, data?: any) => {
    console.warn(`\u001b[33m[WARNING]\u001b[0m ${message}`);
    if (verbose && data) console.warn('  ', JSON.stringify(data, null, 2));
  },
  error: (message: string, error?: any) => {
    console.error(`\u001b[31m[ERROR]\u001b[0m ${message}`);
    if (error && error.message) {
      console.error(`  Error: ${error.message}`);
    }
    if (verbose && error) {
      console.error('  Full error:', error);
    }
  },
  section: (title: string) => {
    console.log(`\n\u001b[1m\u001b[4m${title}\u001b[0m`);
  },
};

/**
 * Test basic database connectivity and health
 */
async function testDatabaseHealth() {
  logger.section('Database Health Check');
  
  try {
    logger.info('Running database health check...');
    const health = await checkDatabaseHealth();
    
    if (health.healthy) {
      logger.success('Database is healthy', {
        responseTime: health.responseTime,
        timestamp: health.timestamp,
        activeConnections: health.activeConnections,
        postgresVersion: health.postgresVersion?.substring(0, 50) + '...',
      });
      
      if (verbose) {
        logger.info('Full health check results', health);
      }
      
      return true;
    } else {
      logger.error('Database health check failed', {
        error: health.error,
        errorCode: health.errorCode,
        responseTime: health.responseTime,
      });
      return false;
    }
  } catch (error) {
    logger.error('Failed to run database health check', error);
    return false;
  }
}

/**
 * Test database schema and operations
 */
async function testDatabaseSchema() {
  logger.section('Database Schema Validation');
  
  try {
    logger.info('Running database operations test...');
    const operationsResult = await testDatabaseOperations();
    
    logger.info(`Schema validation completed: ${operationsResult.overallStatus}`, {
      summary: operationsResult.summary,
    });
    
    // Report individual test results
    for (const test of operationsResult.tests) {
      if (test.status === 'PASS') {
        logger.success(`${test.name}: ${test.details}`);
      } else if (test.status === 'WARN') {
        logger.warn(`${test.name}: ${test.details}`);
      } else {
        logger.error(`${test.name}: ${test.details}`);
      }
    }
    
    if (verbose) {
      logger.info('Full operations test results', operationsResult);
    }
    
    return operationsResult.overallStatus !== 'FAIL';
  } catch (error) {
    logger.error('Failed to run database schema validation', error);
    return false;
  }
}

/**
 * Test development user functionality
 */
async function testDevUserOperations() {
  logger.section('Development User Operations Test');
  
  try {
    logger.info('Testing development user creation/retrieval...');
    
    // Test user creation or retrieval
    const devUser = await getOrCreateDevUser();
    
    if (!devUser || !devUser.id) {
      throw new Error('Failed to get or create development user');
    }
    
    logger.success('Development user operation successful', {
      id: devUser.id,
      name: devUser.name,
      email: devUser.email,
      createdAt: devUser.createdAt,
      emailVerified: devUser.emailVerified,
    });
    
    // Test session creation
    logger.info('Testing development session creation...');
    const sessionToken = await createDevSession(devUser.id);
    
    if (!sessionToken) {
      throw new Error('Failed to create development session');
    }
    
    logger.success('Development session created successfully', {
      userId: devUser.id,
      tokenPreview: sessionToken.substring(0, 8) + '...',
      tokenLength: sessionToken.length,
    });
    
    return { user: devUser, sessionToken };
  } catch (error) {
    logger.error('Development user operations failed', error);
    return null;
  }
}

/**
 * Test the complete auto-login flow
 */
async function testAutoLogin() {
  logger.section('Auto-Login Flow Test');
  
  try {
    logger.info('Testing complete auto-login flow...');
    
    const loginResult = await handleDevAutoLogin();
    
    if (!loginResult) {
      throw new Error('Auto-login returned null - check environment and database');
    }
    
    logger.success('Auto-login flow completed successfully', {
      userId: loginResult.user.id,
      userName: loginResult.user.name,
      userEmail: loginResult.user.email,
      tokenPreview: loginResult.sessionToken.substring(0, 8) + '...',
      diagnostics: loginResult.diagnostics,
    });
    
    if (verbose && loginResult.diagnostics) {
      logger.info('Auto-login diagnostics', loginResult.diagnostics);
    }
    
    return loginResult;
  } catch (error) {
    logger.error('Auto-login flow test failed', error);
    return null;
  }
}

/**
 * Run all database connection tests
 */
async function runAllTests() {
  logger.section('OpenChat Database Connection Test Suite');
  logger.info('Starting comprehensive database connectivity tests...');
  
  if (testHost) {
    logger.info(`Testing with host override: ${testHost}`);
    // You could modify the DATABASE_URL here if needed
  }
  
  const results = {
    health: false,
    schema: false,
    devUser: false,
    autoLogin: false,
  };
  
  try {
    // Test 1: Database Health
    results.health = await testDatabaseHealth();
    
    if (!results.health) {
      logger.error('Stopping tests - database health check failed');
      return results;
    }
    
    // Test 2: Schema Validation
    results.schema = await testDatabaseSchema();
    
    if (!results.schema) {
      logger.warn('Schema validation had issues, but continuing with other tests...');
    }
    
    // Test 3: Development User Operations
    const devUserResult = await testDevUserOperations();
    results.devUser = devUserResult !== null;
    
    if (!results.devUser) {
      logger.warn('Dev user operations failed, skipping auto-login test...');
    } else {
      // Test 4: Auto-Login Flow
      const autoLoginResult = await testAutoLogin();
      results.autoLogin = autoLoginResult !== null;
    }
    
  } catch (error) {
    logger.error('Test suite failed with unexpected error', error);
  }
  
  // Final summary
  logger.section('Test Results Summary');
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  const failedTests = totalTests - passedTests;
  
  logger.info(`Tests completed: ${passedTests}/${totalTests} passed`);
  
  Object.entries(results).forEach(([testName, passed]) => {
    if (passed) {
      logger.success(`\u2713 ${testName.charAt(0).toUpperCase() + testName.slice(1)} Test: PASSED`);
    } else {
      logger.error(`\u2717 ${testName.charAt(0).toUpperCase() + testName.slice(1)} Test: FAILED`);
    }
  });
  
  if (passedTests === totalTests) {
    logger.success('\u2705 All database connection tests passed!');
    logger.info('Your database setup is working correctly.');
  } else {
    logger.error(`\u274c ${failedTests} test(s) failed`);
    logger.info('Please check the error messages above and fix the issues.');
    
    // Provide common solutions
    logger.section('Common Solutions');
    logger.info('1. Database not running:');
    logger.info('   docker-compose up -d postgres');
    logger.info('2. Schema not migrated:');
    logger.info('   cd apps/server && bun run db:migrate');
    logger.info('3. Wrong environment variables:');
    logger.info('   Check your .env files for correct DATABASE_URL');
    logger.info('4. Connection refused:');
    logger.info('   Make sure PostgreSQL is accessible on the configured port');
  }
  
  return results;
}

/**
 * Main execution
 */
async function main() {
  try {
    const results = await runAllTests();
    
    // Exit with appropriate code
    const allPassed = Object.values(results).every(Boolean);
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    logger.error('Test suite execution failed', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  logger.warn('Test suite interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  logger.warn('Test suite terminated');
  process.exit(143);
});

// Run the main function
if (import.meta.main) {
  main().catch((error) => {
    logger.error('Unhandled error in test suite', error);
    process.exit(1);
  });
}

export { runAllTests, testDatabaseHealth, testDatabaseSchema, testDevUserOperations, testAutoLogin };