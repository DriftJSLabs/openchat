// Environment variable configuration for OpenChat
// Using Convex for authentication and database

class EnvironmentConfig {
  // Required for Convex
  readonly NEXT_PUBLIC_CONVEX_URL: string;
  
  // Required for OpenRouter token encryption
  readonly OPENROUTER_ENCRYPTION_SECRET: string;
  
  // Optional but recommended for production
  readonly NEXT_PUBLIC_APP_URL: string;
  readonly NEXT_PUBLIC_OPENROUTER_APP_URL: string;
  
  // Data directories (for local development)
  readonly STREAM_DATA_DIR: string;
  
  // Development/Production flags
  readonly NODE_ENV: string;
  readonly ENABLE_DEV_AUTH?: string;
  readonly CONVEX_ENV?: string;

  constructor() {
    // Validate required Convex URL
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error(
        'NEXT_PUBLIC_CONVEX_URL is required. ' +
        'Get your Convex URL from https://dashboard.convex.dev'
      );
    }
    this.NEXT_PUBLIC_CONVEX_URL = convexUrl;

    // OpenRouter encryption secret (can be any string in dev)
    this.OPENROUTER_ENCRYPTION_SECRET = 
      process.env.OPENROUTER_ENCRYPTION_SECRET || 
      'dev-encryption-key-change-in-production';

    // Application URLs
    this.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';
    this.NEXT_PUBLIC_OPENROUTER_APP_URL = 
      process.env.NEXT_PUBLIC_OPENROUTER_APP_URL || 
      'http://localhost:3001';

    // Data directories
    this.STREAM_DATA_DIR = process.env.STREAM_DATA_DIR || '.data/streams';
    
    // Environment flags
    this.NODE_ENV = process.env.NODE_ENV || 'development';
    this.ENABLE_DEV_AUTH = process.env.ENABLE_DEV_AUTH;
    this.CONVEX_ENV = process.env.CONVEX_ENV;
  }

  // Get the base URL for the application
  getBaseURL(): string {
    return this.NEXT_PUBLIC_APP_URL || this.NEXT_PUBLIC_OPENROUTER_APP_URL;
  }
}

// Create and export environment configuration
let env: EnvironmentConfig;

// During build time or on Vercel, use minimal config
const isBuildTime = process.env.NODE_ENV === 'production' && typeof window === 'undefined';
const isVercelBuild = process.env.VERCEL === '1';

try {
  if (isBuildTime || isVercelBuild) {
    // During build, create a minimal config that won't fail
    env = {
      NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL || '',
      OPENROUTER_ENCRYPTION_SECRET: process.env.OPENROUTER_ENCRYPTION_SECRET || 'build-time-secret',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '',
      NEXT_PUBLIC_OPENROUTER_APP_URL: process.env.NEXT_PUBLIC_OPENROUTER_APP_URL || 'http://localhost:3001',
      STREAM_DATA_DIR: process.env.STREAM_DATA_DIR || '.data/streams',
      NODE_ENV: process.env.NODE_ENV || 'development',
      ENABLE_DEV_AUTH: process.env.ENABLE_DEV_AUTH,
      CONVEX_ENV: process.env.CONVEX_ENV,
      getBaseURL: () => process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_OPENROUTER_APP_URL || 'http://localhost:3001',
    } as unknown as EnvironmentConfig;
  } else {
    env = new EnvironmentConfig();
  }
} catch (error) {
  if (process.env.NODE_ENV === 'production' && !isVercelBuild && !isBuildTime) {
    // Fail fast in production (but not during build)
    process.exit(1);
  }
  throw error;
}

export { env };