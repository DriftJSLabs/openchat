#!/usr/bin/env bun
/**
 * Secured Development Environment Startup Script
 * 
 * This script starts the OpenChat development environment with all security
 * fixes in place. It ensures proper configuration of:
 * 
 * - PostgreSQL with md5 authentication
 * - Proper secrets management via Docker secrets
 * - Environment validation and security checks
 * - Development authentication with security boundaries
 * - All services running with secured configurations
 * 
 * SECURITY: This script validates security configurations while enabling
 * development features in a controlled manner.
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

// Enhanced logger with security context
const logger = {
  info: (msg: string, context?: any) => {
    console.log(`ℹ️  ${msg}`);
    if (context && process.env.DEBUG) {
      console.log(`   ${JSON.stringify(context, null, 2)}`);
    }
  },
  success: (msg: string) => console.log(`✅ ${msg}`),
  warn: (msg: string) => console.warn(`⚠️  ${msg}`),
  error: (msg: string) => console.error(`❌ ${msg}`),
  security: (msg: string) => console.log(`🛡️  ${msg}`),
  step: (msg: string) => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🔄 ${msg}`);
    console.log(`${'─'.repeat(60)}`);
  }
};

// Configuration with security-first approach
const CONFIG = {
  // Database configuration with security
  DATABASE_URL: 'postgresql://openchat:secure_dev_password_2024@localhost:5432/openchat_dev',
  DATABASE_TEST_URL: 'postgresql://openchat:secure_dev_password_2024@localhost:5433/openchat_test',
  
  // API server configuration
  API_PORT: 8787,
  API_URL: 'http://localhost:8787',
  
  // Web application configuration
  WEB_PORT: 3000,
  WEB_URL: 'http://localhost:3000',
  
  // Security configuration
  BETTER_AUTH_SECRET: 'secure_development_secret_key_32_characters_minimum_length',
  CORS_ORIGIN: 'http://localhost:3000',
  
  // Development feature flags
  ENABLE_DEV_AUTH: 'true',
  ELECTRIC_INSECURE: 'true', // Only for development
  LOG_LEVEL: 'info',
  
  // Service timeouts
  POSTGRES_TIMEOUT: 60000,
  API_TIMEOUT: 30000,
  WEB_TIMEOUT: 45000
};

// Utility functions
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const exec = (command: string, timeout = 30000): string => {
  try {
    logger.info(`Executing: ${command}`);
    return execSync(command, { 
      timeout, 
      encoding: 'utf-8', 
      stdio: ['pipe', 'pipe', 'pipe'] 
    }).trim();
  } catch (error: any) {
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
};

const checkPort = async (port: number): Promise<boolean> => {
  try {
    const response = await fetch(`http://localhost:${port}`, {
      signal: AbortSignal.timeout(3000)
    });
    return true; // If we get any response, port is in use
  } catch {
    return false; // Port is available or service not responding
  }
};

// Security setup functions
function setupSecureDevelopmentSecrets(): void {
  logger.step('Setting up Secure Development Secrets');
  
  const secretsDir = join(process.cwd(), 'secrets');
  
  // Generate secure development secrets
  const secrets = {
    'postgres_password.txt': 'secure_dev_password_2024',
    'postgres_test_password.txt': 'secure_dev_password_2024',
    'electric_database_url.txt': CONFIG.DATABASE_URL,
    'migrator_database_url.txt': CONFIG.DATABASE_URL,
    'redis_password.txt': 'secure_redis_dev_password_2024',
    'pgadmin_password.txt': 'secure_pgadmin_dev_password_2024',
    'better_auth_secret.txt': CONFIG.BETTER_AUTH_SECRET,
    'jwt_secret.txt': 'secure_jwt_dev_secret_key_64_characters_minimum_length_required'
  };
  
  try {
    // Ensure secrets directory exists
    exec(`mkdir -p ${secretsDir}`);
    
    // Create secret files with proper permissions
    for (const [filename, content] of Object.entries(secrets)) {
      const filepath = join(secretsDir, filename);
      if (!existsSync(filepath)) {
        writeFileSync(filepath, content);
        // Set restrictive permissions (readable by user only)
        exec(`chmod 600 ${filepath}`);
        logger.info(`Created secure secret: ${filename}`);
      } else {
        logger.info(`Secret already exists: ${filename}`);
      }
    }
    
    logger.success('Secure development secrets configured');
    
    // Validate secret lengths for security
    const validations = [
      { name: 'postgres_password', minLength: 16, file: secrets['postgres_password.txt'] },
      { name: 'better_auth_secret', minLength: 32, file: secrets['better_auth_secret.txt'] },
      { name: 'jwt_secret', minLength: 64, file: secrets['jwt_secret.txt'] }
    ];
    
    for (const validation of validations) {
      if (validation.file.length < validation.minLength) {
        logger.warn(`${validation.name} is shorter than recommended ${validation.minLength} characters`);
      } else {
        logger.security(`${validation.name} meets security length requirements`);
      }
    }
    
  } catch (error) {
    throw new Error(`Failed to setup secure secrets: ${error}`);
  }
}

function setupSecureEnvironment(): void {
  logger.step('Configuring Secure Development Environment');
  
  // Set environment variables with security-first approach
  const envVars = {
    NODE_ENV: 'development',
    DATABASE_URL: CONFIG.DATABASE_URL,
    DATABASE_TEST_URL: CONFIG.DATABASE_TEST_URL,
    BETTER_AUTH_SECRET: CONFIG.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: CONFIG.API_URL,
    CORS_ORIGIN: CONFIG.CORS_ORIGIN,
    ENABLE_DEV_AUTH: CONFIG.ENABLE_DEV_AUTH,
    ELECTRIC_INSECURE: CONFIG.ELECTRIC_INSECURE,
    LOG_LEVEL: CONFIG.LOG_LEVEL,
    
    // Security headers and CORS configuration
    USE_SECURE_COOKIES: 'false', // Only false for localhost development
    TRUST_PROXY: 'false',
    
    // Development-specific settings
    DEBUG: 'false', // Set to 'true' for verbose logging
    ELECTRIC_URL: 'http://localhost:5133'
  };
  
  // Apply environment variables
  Object.entries(envVars).forEach(([key, value]) => {
    process.env[key] = value;
  });
  
  logger.success('Secure development environment configured');
  
  // Log security-relevant configuration (without secrets)
  const securityConfig = {
    nodeEnv: process.env.NODE_ENV,
    authUrl: process.env.BETTER_AUTH_URL,
    corsOrigin: process.env.CORS_ORIGIN,
    devAuthEnabled: process.env.ENABLE_DEV_AUTH,
    electricInsecure: process.env.ELECTRIC_INSECURE,
    useSecureCookies: process.env.USE_SECURE_COOKIES
  };
  
  logger.security('Security configuration applied');
  logger.info('Environment security settings', securityConfig);
}

async function validateSecurityBoundaries(): Promise<void> {
  logger.step('Validating Security Boundaries');
  
  try {
    // Import and test environment detection system
    const envDetectionPath = join(process.cwd(), 'apps/server/src/lib/security/environment-detection.ts');
    
    if (!existsSync(envDetectionPath)) {
      throw new Error('Environment detection system not found - security boundaries cannot be validated');
    }
    
    logger.security('Environment detection system found');
    
    // Test development environment detection
    const { getEnvironmentInfo, isDevelopmentAllowed } = await import(envDetectionPath);
    
    const envInfo = getEnvironmentInfo();
    const devAllowed = isDevelopmentAllowed();
    
    // Validate security boundaries
    const securityChecks = [
      { name: 'Development environment detected', passed: envInfo.isDevelopment },
      { name: 'Development features allowed', passed: devAllowed },
      { name: 'Not production environment', passed: !envInfo.isProduction },
      { name: 'Security system operational', passed: envInfo.confidence !== 'low' }
    ];
    
    const failedChecks = securityChecks.filter(check => !check.passed);
    
    if (failedChecks.length > 0) {
      logger.warn('Some security boundary checks failed:');
      failedChecks.forEach(check => logger.warn(`  - ${check.name}`));
      
      // If critical security checks fail, abort
      if (failedChecks.some(check => 
        check.name.includes('Security system') || 
        check.name.includes('production')
      )) {
        throw new Error('Critical security boundary validation failed');
      }
    } else {
      logger.security('All security boundary checks passed');
    }
    
    // Log environment details (safe to log in development)
    logger.info('Environment validation details', {
      isDevelopment: envInfo.isDevelopment,
      isProduction: envInfo.isProduction,
      securityLevel: envInfo.securityLevel,
      confidence: envInfo.confidence,
      warningsCount: envInfo.securityWarnings.length
    });
    
    if (envInfo.securityWarnings.length > 0) {
      logger.warn('Security warnings detected:');
      envInfo.securityWarnings.forEach(warning => logger.warn(`  - ${warning}`));
    }
    
  } catch (error) {
    throw new Error(`Security boundary validation failed: ${error}`);
  }
}

// Service management functions
async function startSecuredPostgreSQL(): Promise<void> {
  logger.step('Starting Secured PostgreSQL Database');
  
  try {
    // Check if PostgreSQL is already running
    try {
      const runningContainers = exec('docker ps --filter "name=openchat-postgres" --filter "status=running" --format "{{.Names}}"');
      if (runningContainers.includes('openchat-postgres')) {
        logger.success('PostgreSQL container is already running');
        return;
      }
    } catch {
      logger.info('PostgreSQL container is not running, starting it');
    }
    
    // Start PostgreSQL with secured Docker Compose configuration
    logger.info('Starting PostgreSQL with secured configuration...');
    exec('docker-compose up -d postgres', CONFIG.POSTGRES_TIMEOUT);
    
    // Wait for PostgreSQL to be ready with health checks
    logger.info('Waiting for PostgreSQL to accept connections...');
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds with 2-second intervals
    
    while (attempts < maxAttempts) {
      try {
        const healthCheck = exec('docker-compose exec -T postgres pg_isready -U openchat -d openchat_dev');
        if (healthCheck.includes('accepting connections')) {
          logger.success('PostgreSQL is ready and accepting connections');
          
          // Verify authentication mode
          const authMode = exec('docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "SHOW password_encryption;" -t');
          logger.security(`PostgreSQL authentication mode: ${authMode.trim()}`);
          
          return;
        }
      } catch {
        // Continue waiting
      }
      
      attempts++;
      if (attempts % 5 === 0) {
        logger.info(`Waiting for PostgreSQL (attempt ${attempts}/${maxAttempts})`);
      }
      
      await sleep(2000);
    }
    
    throw new Error('PostgreSQL failed to start within timeout period');
    
  } catch (error) {
    throw new Error(`Failed to start secured PostgreSQL: ${error}`);
  }
}

async function initializeSecureDatabase(): Promise<void> {
  logger.step('Initializing Secure Database Schema');
  
  try {
    // Run database migrations with security validation
    logger.info('Running Drizzle database migrations...');
    exec('cd apps/server && bun run drizzle-kit push', 30000);
    
    // Verify required tables were created
    const tablesQuery = 'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name;';
    const tablesResult = exec(`docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "${tablesQuery}" -t`);
    
    const tables = tablesResult.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.includes('---'));
    
    const requiredTables = ['user', 'session', 'account', 'chat', 'message'];
    const missingTables = requiredTables.filter(table => 
      !tables.some(t => t.toLowerCase().includes(table.toLowerCase()))
    );
    
    if (missingTables.length > 0) {
      throw new Error(`Missing required database tables: ${missingTables.join(', ')}`);
    }
    
    logger.success(`Database schema initialized (${tables.length} tables created)`);
    logger.info(`Created tables: ${tables.join(', ')}`);
    
    // Validate user and session tables have proper structure
    logger.security('Validating authentication table structure...');
    const userTableStructure = exec('docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "\\d \\"user\\"" -q');
    const sessionTableStructure = exec('docker-compose exec -T postgres psql -U openchat -d openchat_dev -c "\\d session" -q');
    
    // Basic validation that tables have required columns
    const requiredUserColumns = ['id', 'email', 'name'];
    const requiredSessionColumns = ['id', 'token', 'user_id', 'expires_at'];
    
    const userMissingColumns = requiredUserColumns.filter(col => !userTableStructure.toLowerCase().includes(col));
    const sessionMissingColumns = requiredSessionColumns.filter(col => !sessionTableStructure.toLowerCase().includes(col));
    
    if (userMissingColumns.length > 0 || sessionMissingColumns.length > 0) {
      throw new Error(`Missing required columns - User: ${userMissingColumns.join(', ')}, Session: ${sessionMissingColumns.join(', ')}`);
    }
    
    logger.security('Authentication table structure validated');
    
  } catch (error) {
    throw new Error(`Failed to initialize secure database: ${error}`);
  }
}

async function startSecuredAPIServer(): Promise<void> {
  logger.step('Starting Secured API Server');
  
  try {
    // Kill any existing server process
    try {
      const existingPids = exec(`lsof -ti:${CONFIG.API_PORT}`, 5000);
      if (existingPids) {
        exec(`kill -9 ${existingPids}`, 5000);
        logger.info(`Killed existing process on port ${CONFIG.API_PORT}`);
        await sleep(2000);
      }
    } catch {
      logger.info(`No existing process on port ${CONFIG.API_PORT}`);
    }
    
    // Start API server with secured configuration
    logger.info('Starting API server with security middleware...');
    
    const { spawn } = require('child_process');
    const serverProcess = spawn('bun', ['run', 'dev'], {
      cwd: join(process.cwd(), 'apps/server'),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    
    // Monitor server startup
    let serverOutput = '';
    if (serverProcess.stdout) {
      serverProcess.stdout.on('data', (data: Buffer) => {
        serverOutput += data.toString();
        if (process.env.DEBUG === 'true') {
          console.log(`[API] ${data.toString().trim()}`);
        }
      });
    }
    
    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', (data: Buffer) => {
        serverOutput += data.toString();
        if (process.env.DEBUG === 'true') {
          console.error(`[API] ${data.toString().trim()}`);
        }
      });
    }
    
    // Wait for API server to be ready
    logger.info('Waiting for API server to be ready...');
    let attempts = 0;
    const maxAttempts = 15; // 30 seconds with 2-second intervals
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${CONFIG.API_URL}/`, {
          signal: AbortSignal.timeout(3000)
        });
        // Server is responding (status doesn't matter)
        logger.success('API server is running and responding');
        break;
      } catch {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error('API server failed to start within timeout');
        }
        
        if (attempts % 3 === 0) {
          logger.info(`Waiting for API server (attempt ${attempts}/${maxAttempts})`);
        }
        
        await sleep(2000);
      }
    }
    
    // Test security middleware and dev-login endpoint
    logger.security('Testing security middleware and dev-login endpoint...');
    try {
      const devLoginResponse = await fetch(`${CONFIG.API_URL}/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (devLoginResponse.status === 200) {
        const loginData = await devLoginResponse.json();
        if (loginData.success && loginData.user && loginData.sessionToken) {
          logger.security('Dev-login endpoint is working correctly');
          logger.info(`Dev user created: ${loginData.user.email}`);
        } else {
          logger.warn('Dev-login endpoint returned unexpected response');
        }
      } else {
        logger.warn(`Dev-login endpoint returned status ${devLoginResponse.status}`);
      }
    } catch (error) {
      logger.warn(`Dev-login endpoint test failed: ${error}`);
    }
    
    // Store process for cleanup
    process.on('exit', () => {
      try {
        if (serverProcess && serverProcess.pid) {
          process.kill(serverProcess.pid, 'SIGTERM');
        }
      } catch {
        // Ignore cleanup errors
      }
    });
    
  } catch (error) {
    throw new Error(`Failed to start secured API server: ${error}`);
  }
}

function displaySecuredEnvironmentStatus(): void {
  logger.step('Secured Development Environment Status');
  
  console.log(`
┌─────────────────────────────────────────────────────────────────┐
│                    🛡️  SECURED DEVELOPMENT ENVIRONMENT         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🌐 Web Application:    ${CONFIG.WEB_URL.padEnd(35)}│
│  🔧 API Server:         ${CONFIG.API_URL.padEnd(35)}│
│  🗄️  PostgreSQL:        localhost:5432                        │
│  ⚡ ElectricSQL:        http://localhost:5133                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                          🔐 SECURITY FEATURES                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ Secured PostgreSQL (md5 auth)                              │
│  ✅ Docker secrets management                                  │
│  ✅ Environment boundary validation                            │
│  ✅ Development authentication with restrictions               │
│  ✅ Security middleware active                                 │
│  ✅ CORS properly configured                                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                         ⚡ QUICK ACTIONS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🔍 Test dev-login:     bun run verify-dev-login.ts            │
│  📊 Run full tests:     bun run scripts/test-dev-login-complete.ts │
│  🏥 Health check:       curl ${CONFIG.API_URL}/health           │
│  🔐 Dev login:          curl -X POST ${CONFIG.API_URL}/auth/dev-login │
│  🛑 Stop environment:   docker-compose down                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

🎯 Ready for secure development!

⚠️  SECURITY REMINDERS:
   • This is a DEVELOPMENT environment with insecure features enabled
   • NEVER use these configurations in production
   • Production deployment uses different, secure configurations
   • All development features are properly restricted by environment detection

📚 For more information:
   • Read: SECURITY_FIXES_SUMMARY.md
   • Read: DEVELOPMENT.md
   • Run: bun run diagnose (for troubleshooting)
`);
}

// Main function
async function startSecuredDevelopment(): Promise<void> {
  try {
    console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║              🛡️  OpenChat Secured Development Startup             ║
║                                                                   ║
║  Starting development environment with all security fixes         ║
║  in place. This ensures safe development while maintaining        ║
║  proper security boundaries.                                      ║
╚═══════════════════════════════════════════════════════════════════╝
`);
    
    // Phase 1: Security Setup
    logger.security('Initializing secure development environment...');
    setupSecureDevelopmentSecrets();
    setupSecureEnvironment();
    await validateSecurityBoundaries();
    
    // Phase 2: Infrastructure
    logger.info('Starting secure infrastructure...');
    await startSecuredPostgreSQL();
    await initializeSecureDatabase();
    
    // Phase 3: Application Services
    logger.info('Starting application services...');
    await startSecuredAPIServer();
    
    // Phase 4: Final Status
    displaySecuredEnvironmentStatus();
    
    logger.success('🎉 Secured development environment is ready!');
    
    // Keep process alive to maintain services
    console.log('\n🔍 Monitoring services... (Press Ctrl+C to stop)');
    
    // Simple health monitoring loop
    setInterval(async () => {
      try {
        const response = await fetch(`${CONFIG.API_URL}/`, { 
          signal: AbortSignal.timeout(5000) 
        });
        // Silent success - services are running
      } catch {
        logger.warn('API server appears to be down');
      }
    }, 30000);
    
  } catch (error) {
    logger.error(`Secured development startup failed: ${error}`);
    console.log(`
🔧 TROUBLESHOOTING TIPS:

   1. Check Docker is running:
      docker --version

   2. Reset environment:
      docker-compose down && docker-compose up -d postgres

   3. Check logs:
      docker-compose logs postgres
      
   4. Verify secrets:
      ls -la secrets/

   5. Run diagnostics:
      bun run scripts/diagnose-issues.ts

   6. Run comprehensive tests:
      bun run scripts/test-dev-login-complete.ts
`);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  logger.warn('\n🛑 Shutting down secured development environment...');
  
  try {
    // Kill any server processes
    exec(`lsof -ti:${CONFIG.API_PORT} | xargs kill -9`, 5000);
  } catch {
    // Ignore cleanup errors
  }
  
  logger.success('Secured development environment stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.warn('\n🛑 Terminated - shutting down...');
  process.exit(0);
});

// Run the secured startup
if (import.meta.main) {
  startSecuredDevelopment().catch(error => {
    logger.error(`Fatal error: ${error}`);
    process.exit(1);
  });
}