import { createRateLimit, createEnhancedRateLimit, rateLimitPresets } from "./rate-limit";
import type { Context } from "../lib/context";

/**
 * Enhanced rate limiting configurations specifically for chat operations
 * Provides granular control over different types of chat activities
 * Implements user-based scaling and operation-specific limits
 */

/**
 * Rate limiting for message creation operations
 * Prevents message spam while allowing natural conversation flow
 */
export const messageCreationRateLimit = createEnhancedRateLimit({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 20, // 20 messages per minute for regular users
  userMultiplier: 2, // 40 messages per minute for authenticated users
  premiumMultiplier: 3, // 60 messages per minute for premium users (when implemented)
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `msg-create:user:${userId}` : `msg-create:ip:${context.ipAddress}`;
  },
  onLimitReached: (context, info) => {
    console.warn(`Message creation rate limit reached:`, {
      user: context.session?.user?.id || 'anonymous',
      ip: context.ipAddress,
      requests: info.totalRequests,
      window: info.windowMs,
    });
  },
});

/**
 * Rate limiting for chat creation operations
 * Stricter limits to prevent chat spam
 */
export const chatCreationRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minute window
  maxRequests: 5, // 5 chats per 5 minutes
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `chat-create:user:${userId}` : `chat-create:ip:${context.ipAddress}`;
  },
  onLimitReached: (context, info) => {
    console.warn(`Chat creation rate limit reached:`, {
      user: context.session?.user?.id || 'anonymous',
      ip: context.ipAddress,
      requests: info.totalRequests,
    });
  },
});

/**
 * Rate limiting for typing indicator updates
 * Prevents typing indicator spam while allowing natural typing patterns
 */
export const typingIndicatorRateLimit = createRateLimit({
  windowMs: 10 * 1000, // 10 second window
  maxRequests: 30, // 30 typing updates per 10 seconds
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `typing:user:${userId}` : `typing:ip:${context.ipAddress}`;
  },
  skipSuccessfulRequests: true, // Don't count successful typing updates against limit
});

/**
 * Rate limiting for presence updates
 * Moderate limits for status changes and activity updates
 */
export const presenceUpdateRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 15, // 15 presence updates per minute
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `presence:user:${userId}` : `presence:ip:${context.ipAddress}`;
  },
});

/**
 * Rate limiting for message editing operations
 * Prevents edit spam while allowing reasonable corrections
 */
export const messageEditRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 10, // 10 edits per minute
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `msg-edit:user:${userId}` : `msg-edit:ip:${context.ipAddress}`;
  },
});

/**
 * Rate limiting for message deletion operations
 * Strict limits to prevent bulk deletion abuse
 */
export const messageDeletionRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 5, // 5 deletions per minute
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `msg-delete:user:${userId}` : `msg-delete:ip:${context.ipAddress}`;
  },
});

/**
 * Rate limiting for file upload operations in chat
 * Conservative limits for file uploads to prevent abuse
 */
export const fileUploadRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minute window
  maxRequests: 10, // 10 file uploads per 5 minutes
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `file-upload:user:${userId}` : `file-upload:ip:${context.ipAddress}`;
  },
  onLimitReached: (context, info) => {
    console.warn(`File upload rate limit reached:`, {
      user: context.session?.user?.id || 'anonymous',
      ip: context.ipAddress,
      requests: info.totalRequests,
    });
  },
});

/**
 * Rate limiting for search operations
 * Prevents search abuse while allowing reasonable usage
 */
export const searchRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 30, // 30 searches per minute
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `search:user:${userId}` : `search:ip:${context.ipAddress}`;
  },
});

/**
 * Rate limiting for bulk operations (bulk delete, bulk read, etc.)
 * Very strict limits for bulk operations
 */
export const bulkOperationRateLimit = createRateLimit({
  windowMs: 10 * 60 * 1000, // 10 minute window
  maxRequests: 3, // 3 bulk operations per 10 minutes
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `bulk-ops:user:${userId}` : `bulk-ops:ip:${context.ipAddress}`;
  },
  onLimitReached: (context, info) => {
    console.warn(`Bulk operation rate limit reached:`, {
      user: context.session?.user?.id || 'anonymous',
      ip: context.ipAddress,
      requests: info.totalRequests,
    });
  },
});

/**
 * Rate limiting for user relationship operations (friend requests, blocking, etc.)
 * Moderate limits to prevent relationship spam
 */
export const relationshipRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 10, // 10 relationship operations per minute
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `relationship:user:${userId}` : `relationship:ip:${context.ipAddress}`;
  },
});

/**
 * Rate limiting for profile operations (updates, avatar changes, etc.)
 * Conservative limits for profile modifications
 */
export const profileOperationRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minute window
  maxRequests: 5, // 5 profile operations per 5 minutes
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `profile:user:${userId}` : `profile:ip:${context.ipAddress}`;
  },
});

/**
 * Rate limiting for real-time connection operations
 * Prevents connection spam while allowing reconnections
 */
export const connectionRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 20, // 20 connection attempts per minute
  keyGenerator: (context: Context) => {
    const userId = context.session?.user?.id;
    return userId ? `connection:user:${userId}` : `connection:ip:${context.ipAddress}`;
  },
});

/**
 * Adaptive rate limiting based on user behavior
 * Increases limits for well-behaved users, decreases for problematic ones
 */
export const createAdaptiveRateLimit = (baseConfig: {
  windowMs: number;
  maxRequests: number;
  operation: string;
}) => {
  return createEnhancedRateLimit({
    ...baseConfig,
    keyGenerator: (context: Context) => {
      const userId = context.session?.user?.id;
      const baseKey = userId ? `${baseConfig.operation}:user:${userId}` : `${baseConfig.operation}:ip:${context.ipAddress}`;
      
      // TODO: Implement user reputation system to modify limits
      // For now, use standard key
      return baseKey;
    },
    onLimitReached: (context, info) => {
      console.warn(`Adaptive rate limit reached for ${baseConfig.operation}:`, {
        user: context.session?.user?.id || 'anonymous',
        ip: context.ipAddress,
        requests: info.totalRequests,
        operation: baseConfig.operation,
      });
    },
  });
};

/**
 * Rate limiting configurations by operation type
 * Centralized configuration for easy management
 */
export const chatRateLimits = {
  // Message operations
  messageCreate: messageCreationRateLimit,
  messageEdit: messageEditRateLimit,
  messageDelete: messageDeletionRateLimit,
  
  // Chat operations
  chatCreate: chatCreationRateLimit,
  
  // Real-time operations
  typing: typingIndicatorRateLimit,
  presence: presenceUpdateRateLimit,
  connection: connectionRateLimit,
  
  // File operations
  fileUpload: fileUploadRateLimit,
  
  // Search and discovery
  search: searchRateLimit,
  
  // Bulk operations
  bulkOps: bulkOperationRateLimit,
  
  // Social operations
  relationship: relationshipRateLimit,
  profile: profileOperationRateLimit,
} as const;

/**
 * Middleware factory for chat-specific rate limiting
 * Allows easy application of rate limits to specific endpoints
 */
export const createChatRateLimit = (limitType: keyof typeof chatRateLimits) => {
  return chatRateLimits[limitType];
};

/**
 * Combined middleware for comprehensive chat protection
 * Applies multiple rate limits based on the operation type
 */
export const createComprehensiveChatRateLimit = (operations: Array<keyof typeof chatRateLimits>) => {
  const middlewares = operations.map(op => chatRateLimits[op]);
  
  return async ({ context, next }: { context: Context; next: () => any }) => {
    // Apply rate limits in sequence
    for (const middleware of middlewares) {
      await middleware({ context, next: () => Promise.resolve() });
    }
    
    // If all rate limits pass, continue with the request
    return next();
  };
};

/**
 * Rate limit presets for different chat scenarios
 * Pre-configured combinations for common use cases
 */
export const chatRateLimitPresets = {
  // For regular message endpoints
  messaging: [messageCreationRateLimit],
  
  // For real-time endpoints
  realtime: [typingIndicatorRateLimit, presenceUpdateRateLimit, connectionRateLimit],
  
  // For moderation endpoints
  moderation: [messageDeletionRateLimit, bulkOperationRateLimit],
  
  // For social endpoints
  social: [relationshipRateLimit, profileOperationRateLimit],
  
  // For file/media endpoints
  media: [fileUploadRateLimit],
  
  // For search endpoints
  discovery: [searchRateLimit],
  
  // For administrative endpoints (very strict)
  admin: [bulkOperationRateLimit, profileOperationRateLimit],
} as const;

/**
 * Helper function to apply preset rate limits
 */
export const applyChatRateLimitPreset = (preset: keyof typeof chatRateLimitPresets) => {
  const middlewares = chatRateLimitPresets[preset];
  
  return async ({ context, next }: { context: Context; next: () => any }) => {
    for (const middleware of middlewares) {
      await middleware({ context, next: () => Promise.resolve() });
    }
    return next();
  };
};