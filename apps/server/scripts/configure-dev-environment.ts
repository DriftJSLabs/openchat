#!/usr/bin/env bun

/**
 * Development Environment Configuration Script
 * 
 * This script helps developers set up their environment correctly for dev-login
 * functionality and other development features.
 * 
 * Features:
 * - Validates current environment configuration
 * - Creates missing .env files from examples
 * - Sets up proper dev-mode configuration
 * - Provides Docker networking support detection
 * - Offers configuration recommendations
 * 
 * Usage: bun run apps/server/scripts/configure-dev-environment.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Enhanced logger for environment configuration
const logger = {
  info: (message: string, context?: any) => {
    console.log(`[ENV-CONFIG] ℹ️  ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  success: (message: string, context?: any) => {
    console.log(`[ENV-CONFIG] ✅ ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  warn: (message: string, context?: any) => {
    console.warn(`[ENV-CONFIG] ⚠️  ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[ENV-CONFIG] ❌ ${message}`);
    if (error) {
      console.error(`[ENV-CONFIG] Error details:`, error);
    }
  },
  step: (step: number, total: number, message: string) => {
    console.log(`[ENV-CONFIG] 📋 Step ${step}/${total}: ${message}`);
  },
  section: (sectionName: string) => {
    console.log(`\n[ENV-CONFIG] 📋 ${sectionName}`);
    console.log('='.repeat(60));
  }
};

/**
 * Environment file paths
 */
const ENV_FILES = {
  server: {
    example: resolve(process.cwd(), 'apps/server/.env.example'),
    actual: resolve(process.cwd(), 'apps/server/.env'),
  },
  web: {
    example: resolve(process.cwd(), 'apps/web/.env.example'),
    actual: resolve(process.cwd(), 'apps/web/.env'),
  },
  root: {
    example: resolve(process.cwd(), '.env.example'),
    actual: resolve(process.cwd(), '.env'),
  }
};

/**
 * Required environment variables for dev-login functionality
 */
const REQUIRED_DEV_VARS = {
  server: [
    'NODE_ENV',
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL'
  ],
  web: [
    'NEXT_PUBLIC_SERVER_URL'
  ],
  devOptional: [
    'DEV_MODE',
    'ELECTRIC_INSECURE',
    'ENABLE_DEV_AUTH',
    'NEXT_PUBLIC_DEV_MODE',
    'NEXT_PUBLIC_ENABLE_DEV_AUTH'
  ]
};

/**
 * Detect if we're running in Docker environment
 */
function detectDockerEnvironment(): { isDocker: boolean; recommendations: string[] } {
  const recommendations: string[] = [];
  const indicators = {
    dockerEnv: process.env.DOCKER === 'true',
    dockerFile: existsSync('/.dockerenv'),
    databaseUrl: process.env.DATABASE_URL?.includes('postgres:5432'),
    hostname: process.env.HOSTNAME?.startsWith('docker') || false,
  };

  const isDocker = Object.values(indicators).some(Boolean);

  if (isDocker) {
    recommendations.push('Use postgres:5432 as database host in DATABASE_URL');
    recommendations.push('Set DOCKER=true environment variable');
    recommendations.push('Ensure docker-compose networking is configured');
  } else {
    recommendations.push('Use localhost:5432 as database host in DATABASE_URL');
    recommendations.push('Set DOCKER=false environment variable');
    recommendations.push('Ensure PostgreSQL is running on localhost');
  }

  return { isDocker, recommendations };
}

/**
 * Parse environment file content
 */
function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const env: Record<string, string> = {};

    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=');
        env[key.trim()] = value.trim();
      }
    });

    return env;
  } catch (error) {
    logger.error(`Failed to parse environment file: ${filePath}`, error);
    return {};
  }
}

/**
 * Create environment file from example
 */
function createEnvFromExample(examplePath: string, targetPath: string): boolean {
  try {
    if (!existsSync(examplePath)) {
      logger.error(`Example file not found: ${examplePath}`);
      return false;
    }

    const content = readFileSync(examplePath, 'utf8');
    writeFileSync(targetPath, content);
    logger.success(`Created ${targetPath} from example`);
    return true;
  } catch (error) {
    logger.error(`Failed to create ${targetPath} from example`, error);
    return false;
  }
}

/**
 * Validate environment variables
 */
function validateEnvironment(): {
  server: { missing: string[]; present: string[]; recommendations: string[] };
  web: { missing: string[]; present: string[]; recommendations: string[] };
  devOptional: { missing: string[]; present: string[] };
} {
  const serverEnv = parseEnvFile(ENV_FILES.server.actual);
  const webEnv = parseEnvFile(ENV_FILES.web.actual);
  const combinedEnv = { ...serverEnv, ...webEnv, ...process.env };

  const result = {
    server: { missing: [], present: [], recommendations: [] },
    web: { missing: [], present: [], recommendations: [] },
    devOptional: { missing: [], present: [] }
  };

  // Check required server variables
  REQUIRED_DEV_VARS.server.forEach(varName => {
    if (combinedEnv[varName]) {
      result.server.present.push(varName);
    } else {
      result.server.missing.push(varName);
    }
  });

  // Check required web variables
  REQUIRED_DEV_VARS.web.forEach(varName => {
    if (combinedEnv[varName]) {
      result.web.present.push(varName);
    } else {
      result.web.missing.push(varName);
    }
  });

  // Check development optional variables
  REQUIRED_DEV_VARS.devOptional.forEach(varName => {
    if (combinedEnv[varName]) {
      result.devOptional.present.push(varName);
    } else {
      result.devOptional.missing.push(varName);
    }
  });

  // Generate recommendations
  if (!combinedEnv.DATABASE_URL) {
    result.server.recommendations.push('Set DATABASE_URL to your PostgreSQL connection string');
  }

  if (!combinedEnv.BETTER_AUTH_SECRET) {
    result.server.recommendations.push('Generate a secure BETTER_AUTH_SECRET (minimum 32 characters)');
  }

  if (combinedEnv.NODE_ENV !== 'development') {
    result.server.recommendations.push('Set NODE_ENV=development for dev-login functionality');
  }

  if (!combinedEnv.DEV_MODE && !combinedEnv.ELECTRIC_INSECURE) {
    result.server.recommendations.push('Set DEV_MODE=true or ELECTRIC_INSECURE=true to enable dev-login');
  }

  return result;
}

/**
 * Generate recommended configuration
 */
function generateRecommendedConfig(isDocker: boolean): {
  server: Record<string, string>;
  web: Record<string, string>;
} {
  const serverHost = isDocker ? 'postgres' : 'localhost';
  
  return {
    server: {
      NODE_ENV: 'development',
      DATABASE_URL: `postgresql://openchat:openchat_dev@${serverHost}:5432/openchat_dev`,
      DOCKER: isDocker.toString(),
      HOST: 'localhost',
      PORT: '3000',
      CORS_ORIGIN: 'http://localhost:3001',
      CORS_CREDENTIALS: 'true',
      BETTER_AUTH_SECRET: 'your-secret-key-here-generate-a-secure-random-string-minimum-32-characters',
      BETTER_AUTH_URL: 'http://localhost:3000',
      BETTER_AUTH_TRUSTED_ORIGINS: 'http://localhost:3001',
      LOG_LEVEL: 'debug',
      DEV_MODE: 'true',
      ELECTRIC_INSECURE: 'true',
      ENABLE_DEV_AUTH: 'true'
    },
    web: {
      NODE_ENV: 'development',
      NEXT_PUBLIC_APP_NAME: 'OpenChat',
      NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000',
      NEXT_PUBLIC_WEB_URL: 'http://localhost:3001',
      NEXT_PUBLIC_AUTH_URL: 'http://localhost:3000/api/auth',
      NEXT_PUBLIC_DEBUG_MODE: 'true',
      NEXT_PUBLIC_ENABLE_DEVTOOLS: 'true',
      NEXT_PUBLIC_DEV_MODE: 'true',
      NEXT_PUBLIC_ENABLE_DEV_AUTH: 'true'
    }
  };
}

/**
 * Main configuration function
 */
async function configureDevelopmentEnvironment(): Promise<void> {
  const totalSteps = 6;
  let currentStep = 0;

  logger.info('🚀 Starting development environment configuration...');

  try {
    // Step 1: Detect environment
    logger.step(++currentStep, totalSteps, 'Detecting environment context');
    const { isDocker, recommendations } = detectDockerEnvironment();
    logger.info(`Environment detected: ${isDocker ? 'Docker' : 'Host machine'}`);

    // Step 2: Check for existing .env files
    logger.step(++currentStep, totalSteps, 'Checking existing environment files');
    const envStatus = {
      server: existsSync(ENV_FILES.server.actual),
      web: existsSync(ENV_FILES.web.actual),
      root: existsSync(ENV_FILES.root.actual)
    };
    
    logger.info('Environment files status:', envStatus);

    // Step 3: Create missing .env files from examples
    logger.step(++currentStep, totalSteps, 'Creating missing environment files');
    let filesCreated = 0;

    if (!envStatus.server && existsSync(ENV_FILES.server.example)) {
      if (createEnvFromExample(ENV_FILES.server.example, ENV_FILES.server.actual)) {
        filesCreated++;
      }
    }

    if (!envStatus.web && existsSync(ENV_FILES.web.example)) {
      if (createEnvFromExample(ENV_FILES.web.example, ENV_FILES.web.actual)) {
        filesCreated++;
      }
    }

    if (filesCreated > 0) {
      logger.success(`Created ${filesCreated} environment file(s) from examples`);
    } else {
      logger.info('No new environment files needed');
    }

    // Step 4: Validate current environment
    logger.step(++currentStep, totalSteps, 'Validating environment variables');
    const validation = validateEnvironment();
    
    logger.section('Environment Validation Results');
    
    if (validation.server.missing.length > 0) {
      logger.warn(`Missing required server variables: ${validation.server.missing.join(', ')}`);
    } else {
      logger.success('All required server variables are present');
    }

    if (validation.web.missing.length > 0) {
      logger.warn(`Missing required web variables: ${validation.web.missing.join(', ')}`);
    } else {
      logger.success('All required web variables are present');
    }

    if (validation.devOptional.missing.length > 0) {
      logger.warn(`Missing optional dev variables: ${validation.devOptional.missing.join(', ')}`);
      logger.info('These variables enable enhanced development features like dev-login');
    } else {
      logger.success('All development variables are configured');
    }

    // Step 5: Generate recommendations
    logger.step(++currentStep, totalSteps, 'Generating configuration recommendations');
    const recommendedConfig = generateRecommendedConfig(isDocker);

    logger.section('Configuration Recommendations');
    
    if (isDocker) {
      logger.info('🐳 Docker Environment Detected');
    } else {
      logger.info('💻 Host Machine Environment Detected');
    }

    recommendations.forEach(rec => {
      logger.info(`  • ${rec}`);
    });

    // Step 6: Provide final guidance
    logger.step(++currentStep, totalSteps, 'Providing setup guidance');
    
    logger.section('Next Steps');
    
    if (validation.server.missing.length > 0 || validation.web.missing.length > 0) {
      logger.info('Required actions:');
      
      if (validation.server.missing.length > 0) {
        logger.info('📝 Edit apps/server/.env and set these variables:');
        validation.server.missing.forEach(varName => {
          const recommendedValue = recommendedConfig.server[varName];
          logger.info(`  ${varName}=${recommendedValue || 'your_value_here'}`);
        });
      }

      if (validation.web.missing.length > 0) {
        logger.info('📝 Edit apps/web/.env and set these variables:');
        validation.web.missing.forEach(varName => {
          const recommendedValue = recommendedConfig.web[varName];
          logger.info(`  ${varName}=${recommendedValue || 'your_value_here'}`);
        });
      }
    }

    if (validation.devOptional.missing.length > 0) {
      logger.info('Optional for enhanced dev features:');
      validation.devOptional.missing.forEach(varName => {
        const serverValue = recommendedConfig.server[varName];
        const webValue = recommendedConfig.web[varName];
        const value = serverValue || webValue || 'true';
        
        const location = varName.startsWith('NEXT_PUBLIC_') ? 'apps/web/.env' : 'apps/server/.env';
        logger.info(`  ${varName}=${value} (in ${location})`);
      });
    }

    logger.info('\nAfter updating your environment files:');
    logger.info('1. Run: bun run apps/server/scripts/initialize-dev-system.ts');
    logger.info('2. Run: bun run apps/server/scripts/test-dev-login-system.ts');
    logger.info('3. Start your development servers');

    logger.success('🎉 Environment configuration analysis complete!');

    // Show current environment summary
    logger.section('Current Environment Summary');
    logger.info('Environment context:', {
      isDocker,
      nodeEnv: process.env.NODE_ENV,
      databaseUrl: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@') : 'not set',
      devMode: process.env.DEV_MODE || 'not set',
      electricInsecure: process.env.ELECTRIC_INSECURE || 'not set',
    });

  } catch (error) {
    logger.error('❌ Environment configuration failed:', error);
    process.exit(1);
  }
}

// Run configuration if this script is executed directly
if (import.meta.main) {
  configureDevelopmentEnvironment().catch((error) => {
    logger.error('Unhandled error during environment configuration:', error);
    process.exit(1);
  });
}

export { configureDevelopmentEnvironment };