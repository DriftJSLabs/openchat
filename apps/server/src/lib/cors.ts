/**
 * CORS (Cross-Origin Resource Sharing) Configuration for OpenChat
 * 
 * This module provides comprehensive CORS configuration with support for
 * multiple environments, security policies, and flexible origin handling.
 */

interface CORSOptions {
  // Origins
  origins?: string[] | boolean | ((origin: string) => boolean);
  
  // Methods
  methods?: string[];
  
  // Headers
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  
  // Credentials
  credentials?: boolean;
  
  // Preflight
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
  
  // Security
  strictMode?: boolean;
  logRequests?: boolean;
}

interface CORSEnvironmentConfig {
  development: CORSOptions;
  test: CORSOptions;
  staging: CORSOptions;
  production: CORSOptions;
}

/**
 * Default CORS configuration for different environments
 */
const corsEnvironmentConfig: CORSEnvironmentConfig = {
  development: {
    origins: [
      'http://localhost:3000',   // Server
      'http://localhost:3001',   // Web app
      'http://localhost:3002',   // Test server
      'http://localhost:3010',   // E2E server
      'http://localhost:3011',   // E2E web
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://0.0.0.0:3000',
      'http://0.0.0.0:3001',
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Accept-Language',
      'Content-Language',
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'X-API-Key',
      'X-Client-Version',
      'User-Agent',
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Page-Count',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
    strictMode: false,
    logRequests: true,
  },

  test: {
    origins: [
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3010',
      'http://localhost:3011',
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
    ],
    credentials: true,
    maxAge: 300, // 5 minutes for testing
    strictMode: false,
    logRequests: false,
  },

  staging: {
    origins: [
      'https://staging.openchat.dev',
      'https://staging-api.openchat.dev',
      'https://preview.openchat.dev',
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Accept-Language',
      'Content-Language',
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'X-API-Key',
      'X-Client-Version',
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Page-Count',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset',
    ],
    credentials: true,
    maxAge: 3600, // 1 hour
    strictMode: true,
    logRequests: true,
  },

  production: {
    origins: [
      'https://openchat.dev',
      'https://www.openchat.dev',
      'https://app.openchat.dev',
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Accept-Language',
      'Content-Language',
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'X-API-Key',
      'X-Client-Version',
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
    strictMode: true,
    logRequests: false, // Reduce log noise in production
  },
};

/**
 * Get CORS configuration for current environment
 */
function getCORSConfig(): CORSOptions {
  const env = (process.env.NODE_ENV as keyof CORSEnvironmentConfig) || 'development';
  const baseConfig = corsEnvironmentConfig[env];
  
  // Allow environment variable overrides
  const envOrigins = process.env.CORS_ORIGINS?.split(',').map(origin => origin.trim());
  const envMethods = process.env.CORS_METHODS?.split(',').map(method => method.trim().toUpperCase());
  const envCredentials = process.env.CORS_CREDENTIALS === 'true';
  const envMaxAge = process.env.CORS_MAX_AGE ? parseInt(process.env.CORS_MAX_AGE, 10) : undefined;
  
  return {
    ...baseConfig,
    ...(envOrigins && { origins: envOrigins }),
    ...(envMethods && { methods: envMethods }),
    ...(process.env.CORS_CREDENTIALS !== undefined && { credentials: envCredentials }),
    ...(envMaxAge && { maxAge: envMaxAge }),
  };
}

/**
 * CORS origin validator
 */
class CORSOriginValidator {
  private allowedOrigins: Set<string>;
  private allowedPatterns: RegExp[];
  private allowFunction?: (origin: string) => boolean;

  constructor(origins: string[] | boolean | ((origin: string) => boolean)) {
    this.allowedOrigins = new Set();
    this.allowedPatterns = [];

    if (typeof origins === 'boolean') {
      if (origins) {
        // Allow all origins (not recommended for production)
        this.allowFunction = () => true;
      }
    } else if (typeof origins === 'function') {
      this.allowFunction = origins;
    } else if (Array.isArray(origins)) {
      origins.forEach(origin => {
        if (origin.includes('*')) {
          // Convert wildcard patterns to regex
          const pattern = new RegExp(
            '^' + origin.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$'
          );
          this.allowedPatterns.push(pattern);
        } else {
          this.allowedOrigins.add(origin);
        }
      });
    }
  }

  isAllowed(origin: string): boolean {
    if (!origin) return false;

    // Check function-based validation
    if (this.allowFunction) {
      return this.allowFunction(origin);
    }

    // Check exact matches
    if (this.allowedOrigins.has(origin)) {
      return true;
    }

    // Check pattern matches
    return this.allowedPatterns.some(pattern => pattern.test(origin));
  }
}

/**
 * CORS middleware implementation
 */
export class CORSMiddleware {
  private config: CORSOptions;
  private originValidator: CORSOriginValidator;

  constructor(options?: Partial<CORSOptions>) {
    this.config = {
      ...getCORSConfig(),
      ...options,
    };

    this.originValidator = new CORSOriginValidator(
      this.config.origins || []
    );
  }

  /**
   * Main CORS middleware handler
   */
  handler() {
    return async ({ context, next }: { context: any; next: () => any }) => {
      const request = context.request;
      const origin = request?.headers?.get?.('origin') || 
                    context.headers?.origin || 
                    context.origin;
      
      // Validate origin
      if (origin && this.config.strictMode && !this.originValidator.isAllowed(origin)) {
        if (this.config.logRequests) {
          console.warn(`CORS: Blocked request from unauthorized origin: ${origin}`);
        }
        
        throw new Error(`CORS: Origin ${origin} not allowed`);
      }

      // Set CORS headers
      const headers = this.getCORSHeaders(origin, request?.method || context.method);
      
      // Apply headers to context (implementation depends on your framework)
      if (context.headers) {
        Object.assign(context.headers, headers);
      }

      // Handle preflight requests
      if (this.isPreflightRequest(request?.method || context.method)) {
        if (this.config.logRequests) {
          console.log(`CORS: Preflight request from ${origin}`);
        }
        
        // Return preflight response
        return new Response(null, {
          status: this.config.optionsSuccessStatus || 204,
          headers,
        });
      }

      if (this.config.logRequests) {
        console.log(`CORS: Request from ${origin} - ${request?.method || context.method}`);
      }

      return await next();
    };
  }

  /**
   * Generate CORS headers
   */
  private getCORSHeaders(origin?: string, method?: string): Record<string, string> {
    const headers: Record<string, string> = {};

    // Access-Control-Allow-Origin
    if (origin && this.originValidator.isAllowed(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
    } else if (!this.config.strictMode) {
      headers['Access-Control-Allow-Origin'] = '*';
    }

    // Access-Control-Allow-Credentials
    if (this.config.credentials) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }

    // Access-Control-Allow-Methods
    if (this.config.methods) {
      headers['Access-Control-Allow-Methods'] = this.config.methods.join(', ');
    }

    // Access-Control-Allow-Headers
    if (this.config.allowedHeaders) {
      headers['Access-Control-Allow-Headers'] = this.config.allowedHeaders.join(', ');
    }

    // Access-Control-Expose-Headers
    if (this.config.exposedHeaders) {
      headers['Access-Control-Expose-Headers'] = this.config.exposedHeaders.join(', ');
    }

    // Access-Control-Max-Age
    if (this.config.maxAge && this.isPreflightRequest(method)) {
      headers['Access-Control-Max-Age'] = this.config.maxAge.toString();
    }

    // Security headers
    headers['Vary'] = 'Origin';

    return headers;
  }

  /**
   * Check if request is a preflight request
   */
  private isPreflightRequest(method?: string): boolean {
    return method?.toUpperCase() === 'OPTIONS';
  }

  /**
   * Update CORS configuration
   */
  updateConfig(newConfig: Partial<CORSOptions>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.origins) {
      this.originValidator = new CORSOriginValidator(newConfig.origins);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): CORSOptions {
    return { ...this.config };
  }
}

/**
 * Default CORS middleware instance
 */
export const corsMiddleware = new CORSMiddleware();

/**
 * Create custom CORS middleware with specific options
 */
export function createCORSMiddleware(options?: Partial<CORSOptions>): CORSMiddleware {
  return new CORSMiddleware(options);
}

/**
 * CORS utilities
 */
export const corsUtils = {
  /**
   * Validate origin against allowed patterns
   */
  validateOrigin(origin: string, allowedOrigins: string[]): boolean {
    const validator = new CORSOriginValidator(allowedOrigins);
    return validator.isAllowed(origin);
  },

  /**
   * Extract origin from request
   */
  extractOrigin(request: any): string | null {
    return request?.headers?.get?.('origin') || 
           request?.headers?.origin || 
           null;
  },

  /**
   * Generate secure CORS configuration for production
   */
  getSecureConfig(allowedOrigins: string[]): CORSOptions {
    return {
      origins: allowedOrigins,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
      allowedHeaders: [
        'Accept',
        'Accept-Language',
        'Content-Language',
        'Content-Type',
        'Authorization',
        'X-CSRF-Token',
      ],
      exposedHeaders: [
        'X-Rate-Limit-Remaining',
        'X-Rate-Limit-Reset',
      ],
      credentials: true,
      maxAge: 86400,
      strictMode: true,
      logRequests: false,
    };
  },

  /**
   * Generate development CORS configuration
   */
  getDevelopmentConfig(): CORSOptions {
    return corsEnvironmentConfig.development;
  },
};

/**
 * Environment-specific CORS configurations
 */
export const corsConfigs = {
  development: corsEnvironmentConfig.development,
  test: corsEnvironmentConfig.test,
  staging: corsEnvironmentConfig.staging,
  production: corsEnvironmentConfig.production,
};

export default corsMiddleware;