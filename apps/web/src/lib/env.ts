import { randomBytes } from 'crypto';

// Development-only secret generation
function generateDevSecret(name: string): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is required in production`);
  }
  // Generate a deterministic but unique secret for development
  const devSecret = randomBytes(32).toString('hex');
  return devSecret;
}

// Environment variable validation
class EnvironmentConfig {
  // Required variables
  readonly NEXT_PUBLIC_CONVEX_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_DATABASE_URL: string;
  readonly OPENROUTER_ENCRYPTION_SECRET: string;
  
  // Optional but recommended for production
  readonly NEXT_PUBLIC_APP_URL: string;
  readonly NEXT_PUBLIC_OPENROUTER_APP_URL: string;
  
  // Optional AI provider keys
  readonly OPENAI_API_KEY?: string;
  readonly ANTHROPIC_API_KEY?: string;
  
  // Data directories
  readonly AUTH_DATA_DIR: string;
  readonly STREAM_DATA_DIR: string;

  constructor() {
    // Validate required variables
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error(
        'NEXT_PUBLIC_CONVEX_URL is required. ' +
        'Get your Convex URL from https://dashboard.convex.dev'
      );
    }
    this.NEXT_PUBLIC_CONVEX_URL = convexUrl;

    // Handle auth secret
    this.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 
      generateDevSecret('BETTER_AUTH_SECRET');

    // Handle data directories
    const dataDir = process.env.AUTH_DATA_DIR || '.data';
    this.AUTH_DATA_DIR = dataDir;
    this.STREAM_DATA_DIR = process.env.STREAM_DATA_DIR || `${dataDir}/streams`;
    
    // Handle database URL
    this.BETTER_AUTH_DATABASE_URL = process.env.BETTER_AUTH_DATABASE_URL || 
      `file:${dataDir}/auth.db`;

    // Handle encryption secret
    this.OPENROUTER_ENCRYPTION_SECRET = process.env.OPENROUTER_ENCRYPTION_SECRET ||
      generateDevSecret('OPENROUTER_ENCRYPTION_SECRET');

    // Handle app URLs
    const defaultUrl = process.env.NODE_ENV === 'production' 
      ? '' 
      : 'http://localhost:3001';
    
    this.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || defaultUrl;
    this.NEXT_PUBLIC_OPENROUTER_APP_URL = process.env.NEXT_PUBLIC_OPENROUTER_APP_URL || 
      this.NEXT_PUBLIC_APP_URL || 
      defaultUrl;

    if (process.env.NODE_ENV === 'production' && !this.NEXT_PUBLIC_APP_URL) {
      throw new Error(
        'NEXT_PUBLIC_APP_URL is required in production. ' +
        'Set it to your deployment URL (e.g., https://your-app.vercel.app)'
      );
    }

    // Optional AI provider keys
    this.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    this.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    // Log configuration status in development
    if (process.env.NODE_ENV !== 'production') {
      this.logConfigStatus();
    }
  }

  private logConfigStatus() {
    const status = {
      'Convex URL': this.NEXT_PUBLIC_CONVEX_URL ? '✅' : '❌',
      'Auth Secret': this.BETTER_AUTH_SECRET ? '✅' : '❌',
      'Database URL': this.BETTER_AUTH_DATABASE_URL ? '✅' : '❌',
      'Encryption Secret': this.OPENROUTER_ENCRYPTION_SECRET ? '✅' : '❌',
      'App URL': this.NEXT_PUBLIC_APP_URL ? '✅' : '⚠️',
      'OpenAI API Key': this.OPENAI_API_KEY ? '✅' : '➖',
      'Anthropic API Key': this.ANTHROPIC_API_KEY ? '✅' : '➖',
    };

    Object.entries(status).forEach(([key, value]) => {
      });
  }

  // Utility method to check if any AI provider is configured
  hasAIProvider(): boolean {
    return Boolean(this.OPENAI_API_KEY || this.ANTHROPIC_API_KEY);
  }

  // Get the base URL for the application
  getBaseURL(): string {
    return this.NEXT_PUBLIC_APP_URL || this.NEXT_PUBLIC_OPENROUTER_APP_URL;
  }
}

// Create and validate environment configuration
let env: EnvironmentConfig;

// During Vercel build, skip validation to prevent build failures
const isVercelBuild = process.env.VERCEL === '1' && process.env.CI === '1';

try {
  if (isVercelBuild) {
    // During build, create a minimal config that won't fail
    const buildEnv = {
      NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL || '',
      NEXT_PUBLIC_OPENROUTER_APP_URL: process.env.NEXT_PUBLIC_OPENROUTER_APP_URL || 'http://localhost:3001',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '',
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'build-time-secret',
      BETTER_AUTH_DATABASE_URL: process.env.BETTER_AUTH_DATABASE_URL || '.data/auth.db',
      AUTH_DATA_DIR: '.data',
      OPENROUTER_ENCRYPTION_SECRET: process.env.OPENROUTER_ENCRYPTION_SECRET || 'build-time-secret',
      STREAM_DATA_DIR: process.env.STREAM_DATA_DIR || '.data/streams',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      NODE_ENV: process.env.NODE_ENV || 'development',
      ENABLE_DEV_AUTH: process.env.ENABLE_DEV_AUTH,
      CONVEX_ENV: process.env.CONVEX_ENV,
      hasAIProvider: () => false,
      getBaseURL: () => process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_OPENROUTER_APP_URL || 'http://localhost:3001',
      logConfigStatus: () => {},
    };
    env = buildEnv as unknown as EnvironmentConfig;
  } else {
    env = new EnvironmentConfig();
  }
} catch (error) {
  if (process.env.NODE_ENV === 'production' && !isVercelBuild) {
    // Fail fast in production (but not during build)
    process.exit(1);
  }
  throw error;
}

export { env };