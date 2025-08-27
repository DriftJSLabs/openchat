/**
 * Development-only authentication utilities
 * 
 * SECURITY: This file should NEVER be used in production environments.
 * It provides auto-login functionality for development convenience only.
 */

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, user, session, checkDatabaseHealth, testDatabaseOperations } from "../db";

/**
 * Enhanced logger for dev-auth operations
 * Provides structured logging with different levels and context
 */
const logger = {
  info: (message: string, context?: any) => {
    console.log(`[DEV-AUTH] ℹ️ ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  success: (message: string, context?: any) => {
    console.log(`[DEV-AUTH] ✅ ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  warn: (message: string, context?: any) => {
    console.warn(`[DEV-AUTH] ⚠️ ${message}`, context ? JSON.stringify(context, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[DEV-AUTH] ❌ ${message}`);
    if (error) {
      console.error(`[DEV-AUTH] Error details:`, error);
      if (error.stack) {
        console.error(`[DEV-AUTH] Stack trace:`, error.stack);
      }
    }
  },
  debug: (message: string, context?: any) => {
    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
      console.debug(`[DEV-AUTH] 🔍 ${message}`, context ? JSON.stringify(context, null, 2) : '');
    }
  },
};

/**
 * Development user configuration
 */
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
 * Checks if we're in a development environment with enhanced security detection
 * SECURITY: Uses comprehensive multi-factor analysis to prevent production bypass
 */
export function isDevelopment(): boolean {
  // Import the secure environment detection system
  const { isDevelopmentAllowed, getEnvironmentInfo } = require('./security/environment-detection');
  
  try {
    const environmentInfo = getEnvironmentInfo();
    const isDevAllowed = isDevelopmentAllowed();
    
    logger.debug('Secure development environment check:', {
      isDevelopment: environmentInfo.isDevelopment,
      isProduction: environmentInfo.isProduction,
      allowDevelopmentFeatures: isDevAllowed,
      securityLevel: environmentInfo.securityLevel,
      confidence: environmentInfo.confidence,
      securityWarnings: environmentInfo.securityWarnings,
      indicators: environmentInfo.indicators,
    });
    
    // Log security warnings if any
    if (environmentInfo.securityWarnings.length > 0) {
      logger.warn('Security warnings detected:', environmentInfo.securityWarnings);
    }
    
    return isDevAllowed;
  } catch (error) {
    // FAIL SAFE: If environment detection fails, default to production security
    logger.error('Environment detection failed - defaulting to production security:', error);
    return false;
  }
}

/**
 * Creates or gets the development user with enhanced error handling and database validation
 * SECURITY: Only works in development mode
 */
export async function getOrCreateDevUser() {
  if (!isDevelopment()) {
    const errorMsg = 'Dev user access is only allowed in development mode';
    logger.error(errorMsg, {
      currentEnv: process.env.NODE_ENV,
      isDev: isDevelopment(),
    });
    throw new Error(errorMsg);
  }

  logger.info('Attempting to get or create development user', {
    email: DEV_USER.email,
    name: DEV_USER.name,
  });

  try {
    // First, test database connectivity
    const healthCheck = await checkDatabaseHealth();
    if (!healthCheck.healthy) {
      logger.error('Database health check failed before dev user operation', healthCheck);
      throw new Error(`Database is not healthy: ${healthCheck.error}`);
    }
    
    logger.debug('Database health check passed', {
      responseTime: healthCheck.responseTime,
      activeConnections: healthCheck.activeConnections,
    });

    // Check if dev user already exists
    logger.debug('Checking for existing development user');
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.email, DEV_USER.email))
      .limit(1);

    if (existingUser.length > 0) {
      logger.success('Found existing development user', {
        id: existingUser[0].id,
        email: existingUser[0].email,
        name: existingUser[0].name,
        createdAt: existingUser[0].createdAt,
      });
      return existingUser[0];
    }

    // Create dev user if it doesn't exist
    logger.info('Creating new development user');
    const newUserId = crypto.randomUUID();
    const newUser = {
      id: newUserId,
      name: DEV_USER.name,
      email: DEV_USER.email,
      emailVerified: DEV_USER.emailVerified,
      image: DEV_USER.image,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    logger.debug('Inserting new user with data', {
      id: newUserId,
      email: newUser.email,
      name: newUser.name,
      emailVerified: newUser.emailVerified,
    });

    const [createdUser] = await db
      .insert(user)
      .values(newUser)
      .returning();

    if (!createdUser) {
      throw new Error('Failed to create user - no data returned from insert operation');
    }

    logger.success('Development user created successfully', {
      id: createdUser.id,
      email: createdUser.email,
      name: createdUser.name,
      createdAt: createdUser.createdAt,
    });
    
    return createdUser;

  } catch (error) {
    logger.error('Failed to create/get development user', error);
    
    // Provide more specific error context
    if (error instanceof Error) {
      // Check for common database connection errors
      if (error.message.includes('ECONNREFUSED')) {
        logger.error('Database connection refused - is PostgreSQL running?', {
          suggestion: 'Run: docker-compose up postgres',
          databaseUrl: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@') : 'not set',
        });
      } else if (error.message.includes('database') && error.message.includes('does not exist')) {
        logger.error('Database does not exist - run migrations first', {
          suggestion: 'Run: bun run db:migrate',
          databaseUrl: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@') : 'not set',
        });
      } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
        logger.error('Database tables do not exist - run migrations first', {
          suggestion: 'Run: bun run db:migrate',
          missingTable: error.message.match(/relation "([^"]+)"/)?.[1] || 'unknown',
        });
      }
    }
    
    throw error;
  }
}

/**
 * Creates a development session for auto-login with enhanced validation and logging
 * SECURITY: Only works in development mode
 */
export async function createDevSession(userId: string): Promise<string> {
  if (!isDevelopment()) {
    const errorMsg = 'Dev sessions are only allowed in development mode';
    logger.error(errorMsg, {
      currentEnv: process.env.NODE_ENV,
      isDev: isDevelopment(),
    });
    throw new Error(errorMsg);
  }

  // Validate userId parameter
  if (!userId || typeof userId !== 'string') {
    const errorMsg = 'Valid userId is required to create development session';
    logger.error(errorMsg, { providedUserId: userId, type: typeof userId });
    throw new Error(errorMsg);
  }

  logger.info('Creating development session', { userId });

  try {
    // Generate secure session token
    const sessionToken = nanoid(64);
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const now = new Date();

    const newSession = {
      id: sessionId,
      token: sessionToken,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ipAddress: 'dev-localhost',
      userAgent: 'dev-auto-login'
    };

    logger.debug('Inserting new session', {
      sessionId,
      userId,
      expiresAt: expiresAt.toISOString(),
      tokenPreview: sessionToken.substring(0, 8) + '...'
    });

    await db.insert(session).values(newSession);

    logger.success('Development session created successfully', {
      sessionId,
      userId,
      expiresAt: expiresAt.toISOString(),
      tokenPreview: sessionToken.substring(0, 8) + '...',
      validFor: '30 days'
    });
    
    return sessionToken;

  } catch (error) {
    logger.error('Failed to create development session', error);
    
    // Provide more specific error context
    if (error instanceof Error) {
      if (error.message.includes('foreign key')) {
        logger.error('User not found - cannot create session for non-existent user', {
          userId,
          suggestion: 'Ensure the user exists before creating a session'
        });
      } else if (error.message.includes('unique')) {
        logger.warn('Session token collision - retrying would be needed in production', {
          suggestion: 'This is rare but could happen with nanoid collisions'
        });
      }
    }
    
    throw error;
  }
}

/**
 * Auto-login endpoint for development with comprehensive error handling and diagnostics
 * SECURITY: Only works in development mode
 */
export async function handleDevAutoLogin(): Promise<{ user: any; sessionToken: string; diagnostics?: any } | null> {
  if (!isDevelopment()) {
    logger.warn('Dev auto-login blocked - not in development mode', {
      currentEnv: process.env.NODE_ENV,
      nodeEnvCheck: process.env.NODE_ENV === 'development',
      electricInsecure: process.env.ELECTRIC_INSECURE === 'true',
      databaseLocal: process.env.DATABASE_URL?.includes('localhost'),
    });
    return null;
  }

  const startTime = Date.now();
  logger.info('Starting development auto-login process');

  try {
    // Step 1: Database health check and diagnostics
    logger.info('Step 1: Running database diagnostics');
    const diagnosticsResult = await testDatabaseOperations();
    
    if (diagnosticsResult.overallStatus === 'FAIL') {
      logger.error('Database diagnostics failed - cannot proceed with auto-login', {
        failed: diagnosticsResult.tests.filter(t => t.status === 'FAIL'),
        summary: diagnosticsResult.summary
      });
      return null;
    }
    
    if (diagnosticsResult.overallStatus === 'WARN') {
      logger.warn('Database diagnostics show warnings - proceeding with caution', {
        warnings: diagnosticsResult.tests.filter(t => t.status === 'WARN'),
        summary: diagnosticsResult.summary
      });
    } else {
      logger.success('Database diagnostics passed', diagnosticsResult.summary);
    }

    // Step 2: Get or create dev user
    logger.info('Step 2: Getting or creating development user');
    const devUser = await getOrCreateDevUser();

    if (!devUser || !devUser.id) {
      throw new Error('Failed to get or create development user - invalid user data returned');
    }

    // Step 3: Create development session
    logger.info('Step 3: Creating development session');
    const sessionToken = await createDevSession(devUser.id);

    if (!sessionToken) {
      throw new Error('Failed to create development session - no token returned');
    }

    const duration = Date.now() - startTime;
    const result = {
      user: devUser,
      sessionToken,
      diagnostics: {
        duration: `${duration}ms`,
        databaseStatus: diagnosticsResult.overallStatus,
        timestamp: new Date().toISOString(),
        environment: {
          nodeEnv: process.env.NODE_ENV,
          databaseUrl: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@') : 'not set',
          electricUrl: process.env.ELECTRIC_URL,
        }
      }
    };

    logger.success('Development auto-login completed successfully', {
      userId: devUser.id,
      userName: devUser.name,
      userEmail: devUser.email,
      tokenPreview: sessionToken.substring(0, 8) + '...',
      duration: `${duration}ms`,
      databaseStatus: diagnosticsResult.overallStatus,
    });

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Development auto-login failed', {
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Provide actionable error guidance
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        logger.error('SOLUTION: Database connection refused', {
          action: 'Start PostgreSQL database',
          commands: [
            'docker-compose up -d postgres',
            'or',
            'docker-compose up postgres'
          ]
        });
      } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
        logger.error('SOLUTION: Database schema not found', {
          action: 'Run database migrations',
          commands: [
            'bun run db:migrate',
            'or',
            'cd apps/server && bun run drizzle-kit push'
          ]
        });
      } else if (error.message.includes('database') && error.message.includes('does not exist')) {
        logger.error('SOLUTION: Database does not exist', {
          action: 'Create database or check connection',
          commands: [
            'docker-compose up -d postgres',
            'then wait 30 seconds for initialization',
            'then try again'
          ]
        });
      }
    }
    
    return null;
  }
}

/**
 * Middleware to inject dev login into auth system
 * SECURITY: Only works in development mode
 */
export function createDevAuthMiddleware() {
  return async (request: Request) => {
    if (!isDevelopment()) {
      return null;
    }

    // Check if this is a dev login request
    const url = new URL(request.url);
    if (url.pathname === '/auth/dev-login' && request.method === 'POST') {
      const result = await handleDevAutoLogin();
      
      if (result) {
        return Response.json({
          success: true,
          user: result.user,
          sessionToken: result.sessionToken,
          message: 'Development auto-login successful'
        });
      } else {
        return Response.json({
          success: false,
          message: 'Development auto-login failed'
        }, { status: 500 });
      }
    }

    return null;
  };
}