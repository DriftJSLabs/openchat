import { ORPCError } from "@orpc/server";
import type { Context } from "../lib/context";

// Rate limit configuration types
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (context: Context) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  onLimitReached?: (context: Context, info: RateLimitInfo) => void; // Callback when limit is reached
}

interface RateLimitInfo {
  totalRequests: number;
  remainingRequests: number;
  resetTime: Date;
  windowMs: number;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
    firstRequest: number;
  };
}

/**
 * In-memory rate limiting store for Cloudflare Workers
 * In production, consider using Cloudflare KV or Durable Objects for distributed rate limiting
 */
class MemoryRateLimitStore {
  private store: RateLimitStore = {};
  private lastCleanup: number = 0;
  private cleanupIntervalMs = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // No global setInterval - we'll clean up on demand
  }

  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup > this.cleanupIntervalMs) {
      this.cleanup();
      this.lastCleanup = now;
    }
  }

  async get(key: string): Promise<{ count: number; resetTime: number } | null> {
    this.maybeCleanup();
    
    const entry = this.store[key];
    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() > entry.resetTime) {
      delete this.store[key];
      return null;
    }

    return {
      count: entry.count,
      resetTime: entry.resetTime,
    };
  }

  async set(key: string, count: number, windowMs: number): Promise<void> {
    const now = Date.now();
    this.store[key] = {
      count,
      resetTime: now + windowMs,
      firstRequest: this.store[key]?.firstRequest || now,
    };
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    this.maybeCleanup();
    
    const now = Date.now();
    const existing = this.store[key];

    if (!existing || now > existing.resetTime) {
      // Create new entry
      this.store[key] = {
        count: 1,
        resetTime: now + windowMs,
        firstRequest: now,
      };
      return {
        count: 1,
        resetTime: now + windowMs,
      };
    } else {
      // Increment existing entry
      existing.count++;
      return {
        count: existing.count,
        resetTime: existing.resetTime,
      };
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const key in this.store) {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
      }
    }
  }

  // Method to get current stats for monitoring
  getStats(): { totalKeys: number; totalRequests: number } {
    let totalRequests = 0;
    const totalKeys = Object.keys(this.store).length;

    for (const entry of Object.values(this.store)) {
      totalRequests += entry.count;
    }

    return { totalKeys, totalRequests };
  }
}

// Lazy-loaded rate limit store instance to avoid global scope issues
let rateLimitStore: MemoryRateLimitStore | null = null;

function getRateLimitStore(): MemoryRateLimitStore {
  if (!rateLimitStore) {
    rateLimitStore = new MemoryRateLimitStore();
  }
  return rateLimitStore;
}

/**
 * Default key generator based on user ID and IP address
 */
function defaultKeyGenerator(context: Context): string {
  const userId = context.session?.user?.id;
  const ip = context.session?.session?.ipAddress || 'unknown';
  
  if (userId) {
    return `user:${userId}`;
  }
  
  return `ip:${ip}`;
}

/**
 * Rate limiting middleware factory for oRPC procedures
 * 
 * This middleware provides flexible rate limiting with support for:
 * - Per-user and per-IP rate limiting
 * - Configurable time windows and request limits
 * - Custom key generators for advanced use cases
 * - Proper error handling and monitoring hooks
 * 
 * @param config - Rate limit configuration
 * @returns oRPC middleware function
 */
export function createRateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    onLimitReached,
  } = config;

  return async ({ context, next }: { context: Context; next: () => any }) => {
    
    try {
      // Generate rate limit key
      const key = keyGenerator(context);
      
      // Get current rate limit status
      const { count, resetTime } = await getRateLimitStore().increment(key, windowMs);
      
      // Check if rate limit is exceeded
      if (count > maxRequests) {
        const rateLimitInfo: RateLimitInfo = {
          totalRequests: count,
          remainingRequests: 0,
          resetTime: new Date(resetTime),
          windowMs,
        };

        // Call limit reached callback if provided
        if (onLimitReached) {
          onLimitReached(context, rateLimitInfo);
        }

        // Add rate limit headers to the error
        const error = new ORPCError("TOO_MANY_REQUESTS", 
          `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds.`
        );
        
        // Attach rate limit info to error for potential header setting
        (error as any).rateLimitInfo = rateLimitInfo;
        
        throw error;
      }

      // Execute the procedure
      let result;
      let procedureError = null;
      
      try {
        result = await next({
          context: {
            ...context,
            rateLimit: {
              totalRequests: count,
              remainingRequests: Math.max(0, maxRequests - count),
              resetTime: new Date(resetTime),
              windowMs,
            } as RateLimitInfo,
          },
        });
      } catch (error) {
        procedureError = error;
        
        // If we should skip failed requests, decrement the counter
        if (skipFailedRequests) {
          const currentData = await getRateLimitStore().get(key);
          if (currentData && currentData.count > 0) {
            await getRateLimitStore().set(key, currentData.count - 1, windowMs);
          }
        }
        
        throw error;
      }

      // If we should skip successful requests, decrement the counter
      if (skipSuccessfulRequests) {
        const currentData = await getRateLimitStore().get(key);
        if (currentData && currentData.count > 0) {
          await getRateLimitStore().set(key, currentData.count - 1, windowMs);
        }
      }

      return result;
      
    } catch (error) {
      // Re-throw the error to be handled by oRPC
      throw error;
    }
  };
}

/**
 * Predefined rate limit configurations for common use cases
 */
export const rateLimitPresets = {
  // Very strict rate limiting for sensitive operations
  strict: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
  },
  
  // Moderate rate limiting for API operations
  moderate: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
  
  // Lenient rate limiting for general use
  lenient: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  },
  
  // AI operations rate limiting (more expensive operations)
  aiOperations: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
  },
  
  // Sync operations rate limiting
  syncOperations: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50,
  },
  
  // Search operations rate limiting
  searchOperations: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
  },
  
  // Authentication operations rate limiting
  authOperations: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
  },
  
  // Bulk operations rate limiting
  bulkOperations: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 3,
  },
} as const;

/**
 * Create rate limiter with enhanced user-based and IP-based keys
 */
export function createEnhancedRateLimit(config: RateLimitConfig & {
  userMultiplier?: number; // Authenticated users get higher limits
  premiumMultiplier?: number; // Premium users get even higher limits
}) {
  const {
    userMultiplier = 2,
    premiumMultiplier = 5,
    ...baseConfig
  } = config;

  return createRateLimit({
    ...baseConfig,
    keyGenerator: (context: Context) => {
      const userId = context.session?.user?.id;
      const ip = context.session?.session?.ipAddress || 'unknown';
      
      if (userId) {
        // TODO: Check if user is premium when user roles are implemented
        const isPremium = false; // context.session?.user?.isPremium
        return `user:${userId}:${isPremium ? 'premium' : 'standard'}`;
      }
      
      return `ip:${ip}`;
    },
    maxRequests: config.maxRequests * (
      // TODO: Adjust limits based on user type when implemented
      // context.session?.user?.isPremium ? premiumMultiplier :
      // context.session?.user ? userMultiplier : 
      1
    ),
  });
}

/**
 * Rate limit monitoring utilities
 */
export const rateLimitMonitoring = {
  // Get current rate limit store statistics
  getStats: () => getRateLimitStore().getStats(),
  
  // Check current rate limit status for a specific key
  checkStatus: async (key: string) => {
    return await getRateLimitStore().get(key);
  },
  
  // Get rate limit info for a context
  getRateLimitInfo: async (context: Context, windowMs: number): Promise<RateLimitInfo | null> => {
    const key = defaultKeyGenerator(context);
    const data = await getRateLimitStore().get(key);
    
    if (!data) return null;
    
    return {
      totalRequests: data.count,
      remainingRequests: Math.max(0, data.count),
      resetTime: new Date(data.resetTime),
      windowMs,
    };
  },
};

/**
 * Rate limit violation logger
 * Useful for monitoring and alerting on rate limit violations
 */
export function logRateLimitViolation(context: Context, info: RateLimitInfo) {
  const logData = {
    timestamp: new Date().toISOString(),
    userId: context.session?.user?.id || 'anonymous',
    ip: context.session?.session?.ipAddress || 'unknown',
    userAgent: context.userAgent || 'unknown',
    violation: {
      totalRequests: info.totalRequests,
      maxRequests: info.totalRequests,
      windowMs: info.windowMs,
      resetTime: info.resetTime.toISOString(),
    },
  };

  // In production, send this to your logging service
  console.warn('Rate limit violation detected:', logData);
  
  // TODO: Integrate with monitoring service (e.g., Sentry, DataDog)
  // monitoringService.logEvent('rate_limit_violation', logData);
}

/**
 * Helper to create commonly used rate limit middleware instances
 */
export const commonRateLimits = {
  // General API rate limiting
  api: createRateLimit(rateLimitPresets.moderate),
  
  // AI operations with enhanced limiting
  ai: createEnhancedRateLimit({
    ...rateLimitPresets.aiOperations,
    onLimitReached: logRateLimitViolation,
  }),
  
  // Sync operations
  sync: createRateLimit({
    ...rateLimitPresets.syncOperations,
    skipSuccessfulRequests: true, // Don't penalize successful syncs
  }),
  
  // Search operations
  search: createRateLimit({
    ...rateLimitPresets.searchOperations,
    onLimitReached: logRateLimitViolation,
  }),
  
  // Bulk operations with strict limiting
  bulk: createRateLimit({
    ...rateLimitPresets.bulkOperations,
    onLimitReached: logRateLimitViolation,
  }),
  
  // Authentication operations
  auth: createRateLimit({
    ...rateLimitPresets.authOperations,
    keyGenerator: (context: Context) => {
      // Use IP for auth operations to prevent account enumeration
      return `auth:${context.session?.session?.ipAddress || 'unknown'}`;
    },
    onLimitReached: logRateLimitViolation,
  }),
};