#!/usr/bin/env bun

/**
 * Complete Dev-Login System Setup Script
 * 
 * This script sets up the entire dev-login system from scratch:
 * 1. Configures environment variables
 * 2. Initializes database with proper schema
 * 3. Creates development user
 * 4. Tests the complete system
 * 5. Provides verification and troubleshooting guidance
 * 
 * Usage: bun run setup-dev-login.ts
 * 
 * This is a comprehensive setup script that should get dev-login working
 * end-to-end on any development machine.
 */

// Enhanced logger for setup process
const logger = {
  info: (message: string, context?: any) => {
    console.log(`[SETUP] ℹ️  ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  success: (message: string, context?: any) => {
    console.log(`[SETUP] ✅ ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  warn: (message: string, context?: any) => {
    console.warn(`[SETUP] ⚠️  ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[SETUP] ❌ ${message}`);
    if (error) {
      console.error(`[SETUP] Error details:`, error);
    }
  },
  step: (step: number, total: number, message: string) => {
    console.log(`[SETUP] 📋 Step ${step}/${total}: ${message}`);
  },
  section: (sectionName: string) => {
    console.log(`\n[SETUP] 🔧 ${sectionName}`);
    console.log('='.repeat(70));
  }
};

/**
 * Check if required tools are available
 */
async function checkPrerequisites(): Promise<boolean> {
  logger.info('Checking prerequisites...');
  
  try {
    // Check if bun is available
    const bunCheck = await Bun.spawn(['bun', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe'
    }).exited;
    
    if (bunCheck !== 0) {
      logger.error('Bun is not available or not working properly');
      return false;
    }
    
    logger.success('Bun is available');
    
    // Check if we can access the database scripts
    const scriptsExist = [
      'apps/server/scripts/configure-dev-environment.ts',
      'apps/server/scripts/initialize-dev-system.ts',
      'apps/server/scripts/test-dev-login-system.ts'
    ].every(script => {
      try {
        return Bun.file(script).size > 0;
      } catch {
        return false;
      }
    });
    
    if (!scriptsExist) {
      logger.error('Required setup scripts are not available');
      return false;
    }
    
    logger.success('All setup scripts are available');
    return true;
    
  } catch (error) {
    logger.error('Failed to check prerequisites:', error);
    return false;
  }
}

/**
 * Run a setup script and handle its output
 */
async function runSetupScript(scriptPath: string, description: string): Promise<boolean> {
  logger.info(`Running ${description}...`);
  
  try {
    const proc = Bun.spawn(['bun', 'run', scriptPath], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: process.cwd(),
    });
    
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    
    const exitCode = await proc.exited;
    
    if (exitCode === 0) {
      logger.success(`${description} completed successfully`);
      if (stdout) {
        console.log(stdout);
      }
      return true;
    } else {
      logger.error(`${description} failed with exit code ${exitCode}`);
      if (stderr) {
        console.error(stderr);
      }
      if (stdout) {
        console.log(stdout);
      }
      return false;
    }
  } catch (error) {
    logger.error(`Failed to run ${description}:`, error);
    return false;
  }
}

/**
 * Check if PostgreSQL is running
 */
async function checkPostgreSQL(): Promise<boolean> {
  logger.info('Checking PostgreSQL availability...');
  
  try {
    // Try to connect to PostgreSQL using a simple test
    const testConnection = Bun.spawn(['docker', 'compose', 'ps', 'postgres'], {
      stdout: 'pipe',
      stderr: 'pipe'
    });
    
    const exitCode = await testConnection.exited;
    
    if (exitCode === 0) {
      logger.success('PostgreSQL appears to be running via Docker Compose');
      return true;
    } else {
      logger.warn('PostgreSQL may not be running via Docker Compose');
      logger.info('Attempting to start PostgreSQL...');
      
      // Try to start PostgreSQL
      const startPostgres = Bun.spawn(['docker', 'compose', 'up', '-d', 'postgres'], {
        stdout: 'pipe',
        stderr: 'pipe'
      });
      
      const startExitCode = await startPostgres.exited;
      
      if (startExitCode === 0) {
        logger.success('PostgreSQL started successfully');
        // Wait a moment for PostgreSQL to fully initialize
        logger.info('Waiting for PostgreSQL to initialize...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        return true;
      } else {
        logger.error('Failed to start PostgreSQL');
        logger.info('Please start PostgreSQL manually with: docker-compose up -d postgres');
        return false;
      }
    }
  } catch (error) {
    logger.error('Failed to check PostgreSQL status:', error);
    return false;
  }
}

/**
 * Provide final verification steps
 */
function provideVerificationSteps(): void {
  logger.section('Verification Steps');
  
  logger.info('To verify that dev-login is working correctly:');
  logger.info('');
  logger.info('1. Start the development servers:');
  logger.info('   • Terminal 1: cd apps/server && bun run dev');
  logger.info('   • Terminal 2: cd apps/web && bun run dev');
  logger.info('');
  logger.info('2. Open your browser to http://localhost:3001');
  logger.info('');
  logger.info('3. Click the "Log In" button');
  logger.info('');
  logger.info('4. You should see a "👨‍💻 Dev Auto-Login (Development Only)" button');
  logger.info('');
  logger.info('5. Click the dev-login button - it should:');
  logger.info('   • Show a loading spinner');
  logger.info('   • Display success message');
  logger.info('   • Refresh the page');
  logger.info('   • Log you in as "Developer User"');
  logger.info('');
  logger.info('If dev-login fails:');
  logger.info('   • Check the browser console for error details');
  logger.info('   • Check the server terminal for error logs');
  logger.info('   • Run: bun run apps/server/scripts/test-dev-login-system.ts');
}

/**
 * Main setup function
 */
async function setupDevLoginSystem(): Promise<void> {
  const totalSteps = 6;
  let currentStep = 0;

  logger.section('OpenChat Dev-Login System Setup');
  logger.info('This script will configure your development environment for dev-login functionality');
  logger.info('');

  try {
    // Step 1: Check prerequisites
    logger.step(++currentStep, totalSteps, 'Checking prerequisites');
    const prereqsOK = await checkPrerequisites();
    if (!prereqsOK) {
      logger.error('Prerequisites check failed');
      process.exit(1);
    }

    // Step 2: Check/Start PostgreSQL
    logger.step(++currentStep, totalSteps, 'Ensuring PostgreSQL is running');
    const postgresOK = await checkPostgreSQL();
    if (!postgresOK) {
      logger.error('PostgreSQL is not available');
      logger.info('Please start PostgreSQL with: docker-compose up -d postgres');
      process.exit(1);
    }

    // Step 3: Configure environment
    logger.step(++currentStep, totalSteps, 'Configuring development environment');
    const envConfigured = await runSetupScript(
      'apps/server/scripts/configure-dev-environment.ts',
      'Environment configuration'
    );
    
    if (!envConfigured) {
      logger.warn('Environment configuration had issues, but continuing...');
    }

    // Step 4: Initialize database and dev system
    logger.step(++currentStep, totalSteps, 'Initializing database and development system');
    const systemInitialized = await runSetupScript(
      'apps/server/scripts/initialize-dev-system.ts',
      'Database and system initialization'
    );
    
    if (!systemInitialized) {
      logger.error('Failed to initialize the development system');
      logger.info('Common solutions:');
      logger.info('  • Ensure PostgreSQL is running: docker-compose up -d postgres');
      logger.info('  • Check DATABASE_URL in apps/server/.env');
      logger.info('  • Wait longer for PostgreSQL to start up');
      process.exit(1);
    }

    // Step 5: Test the complete system
    logger.step(++currentStep, totalSteps, 'Testing dev-login system');
    const systemTested = await runSetupScript(
      'apps/server/scripts/test-dev-login-system.ts',
      'Dev-login system testing'
    );
    
    if (!systemTested) {
      logger.warn('System testing had issues - dev-login may not work correctly');
      logger.info('Please review the test output above for specific problems');
    } else {
      logger.success('All system tests passed! 🎉');
    }

    // Step 6: Provide verification steps
    logger.step(++currentStep, totalSteps, 'Setup complete - providing verification steps');
    
    logger.section('Setup Complete! 🎉');
    logger.success('Dev-login system has been set up successfully');
    logger.info('');

    provideVerificationSteps();

    logger.section('Troubleshooting');
    logger.info('If you encounter issues:');
    logger.info('');
    logger.info('1. Environment issues:');
    logger.info('   bun run apps/server/scripts/configure-dev-environment.ts');
    logger.info('');
    logger.info('2. Database issues:');
    logger.info('   bun run apps/server/scripts/initialize-dev-system.ts');
    logger.info('');
    logger.info('3. System testing:');
    logger.info('   bun run apps/server/scripts/test-dev-login-system.ts');
    logger.info('');
    logger.info('4. Manual HTTP test:');
    logger.info('   curl -X POST http://localhost:3000/api/auth/dev-login');
    logger.info('');

    logger.success('🚀 Ready to start developing with dev-login!');

  } catch (error) {
    logger.error('❌ Setup failed with unexpected error:', error);
    
    logger.section('Recovery Steps');
    logger.info('Try these steps to recover:');
    logger.info('1. Ensure Docker is running');
    logger.info('2. Run: docker-compose up -d postgres');
    logger.info('3. Wait 30 seconds for PostgreSQL to start');
    logger.info('4. Run this setup script again: bun run setup-dev-login.ts');
    
    process.exit(1);
  }
}

// Run setup if this script is executed directly
if (import.meta.main) {
  setupDevLoginSystem().catch((error) => {
    logger.error('Unhandled error during setup:', error);
    process.exit(1);
  });
}

export { setupDevLoginSystem };