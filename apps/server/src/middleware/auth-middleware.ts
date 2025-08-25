import { ORPCError } from "@orpc/server";
import type { Context } from "../lib/context";
import { db } from "../db";
import * as authSchema from "../db/schema/auth";
import * as chatSchema from "../db/schema/chat";
import { eq, and, or, inArray } from "drizzle-orm";
import { presenceHelpers } from "../lib/presence-service";
import { createRateLimit } from "./rate-limit";

/**
 * Authentication and authorization middleware for chat operations
 * Provides comprehensive security and access control for chat features
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  username?: string;
  displayName?: string;
  status?: string;
  isPrivate?: boolean;
  allowDirectMessages?: boolean;
  isActive?: boolean;
  isBlocked?: boolean;
  isSuspended?: boolean;
}

export interface EnhancedContext extends Context {
  user: AuthUser;
  permissions: Set<string>;
  relationships: Map<string, string>; // userId -> relationshipType
}

/**
 * Base authentication middleware - ensures user is authenticated
 */
export const requireAuth = async ({ context, next }: { context: Context; next: () => any }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED", "Authentication required");
  }

  // Update user activity
  await presenceHelpers.updateActivity(context.session.user.id).catch(() => {
    // Non-blocking - log but don't fail the request
    console.warn("Failed to update user activity for:", context.session?.user?.id);
  });

  return next({
    context: {
      ...context,
      user: context.session.user,
    },
  });
};

/**
 * Enhanced authentication middleware with user profile and relationship data
 */
export const requireEnhancedAuth = async ({ context, next }: { context: Context; next: () => any }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED", "Authentication required");
  }

  const userId = context.session.user.id;

  try {
    // Get enhanced user data with profile information
    const [userData] = await db
      .select({
        id: authSchema.user.id,
        name: authSchema.user.name,
        email: authSchema.user.email,
        username: authSchema.user.username,
        displayName: authSchema.user.displayName,
        status: authSchema.user.status,
        isPrivate: authSchema.user.isPrivate,
        allowDirectMessages: authSchema.user.allowDirectMessages,
        isActive: authSchema.user.isActive,
        isBlocked: authSchema.user.isBlocked,
        isSuspended: authSchema.user.isSuspended,
        suspendedUntil: authSchema.user.suspendedUntil,
      })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId))
      .limit(1);

    if (!userData) {
      throw new ORPCError("UNAUTHORIZED", "User not found");
    }

    // Check if user account is suspended
    if (userData.isSuspended) {
      const now = new Date();
      if (!userData.suspendedUntil || userData.suspendedUntil > now) {
        throw new ORPCError("FORBIDDEN", "Account is suspended");
      }
      // If suspension has expired, clear the suspension
      await db
        .update(authSchema.user)
        .set({ 
          isSuspended: false, 
          suspendedUntil: null,
          updatedAt: now,
        })
        .where(eq(authSchema.user.id, userId));
    }

    // Check if user account is blocked
    if (userData.isBlocked) {
      throw new ORPCError("FORBIDDEN", "Account is blocked");
    }

    // Check if user account is deactivated
    if (!userData.isActive) {
      throw new ORPCError("FORBIDDEN", "Account is deactivated");
    }

    // Get user relationships for authorization purposes
    const relationships = await db
      .select({
        toUserId: authSchema.userRelationship.toUserId,
        relationshipType: authSchema.userRelationship.relationshipType,
      })
      .from(authSchema.userRelationship)
      .where(
        and(
          eq(authSchema.userRelationship.fromUserId, userId),
          eq(authSchema.userRelationship.status, "active")
        )
      );

    const relationshipMap = new Map<string, string>();
    relationships.forEach(rel => {
      relationshipMap.set(rel.toUserId, rel.relationshipType);
    });

    // Define basic permissions (can be extended with role-based permissions later)
    const permissions = new Set([
      "chat:read",
      "chat:create",
      "message:create",
      "message:read",
      "profile:read",
      "presence:update",
    ]);

    // Update user activity
    await presenceHelpers.updateActivity(userId).catch(() => {
      console.warn("Failed to update user activity for:", userId);
    });

    return next({
      context: {
        ...context,
        user: userData,
        permissions,
        relationships: relationshipMap,
      } as EnhancedContext,
    });
  } catch (error) {
    if (error instanceof ORPCError) {
      throw error;
    }
    console.error("Enhanced auth middleware error:", error);
    throw new ORPCError("INTERNAL_SERVER_ERROR", "Authentication error");
  }
};

/**
 * Chat access authorization middleware
 * Checks if user has permission to access a specific chat
 */
export const requireChatAccess = (chatIdParam: string = "chatId") => {
  return async ({ context, next }: { context: EnhancedContext; next: () => any }) => {
    if (!context.user) {
      throw new ORPCError("UNAUTHORIZED", "Authentication required");
    }

    const chatId = (context as any)[chatIdParam] || (context as any).input?.[chatIdParam];
    
    if (!chatId) {
      throw new ORPCError("BAD_REQUEST", "Chat ID is required");
    }

    try {
      // Get chat information
      const [chat] = await db
        .select({
          id: chatSchema.chat.id,
          title: chatSchema.chat.title,
          userId: chatSchema.chat.userId,
          chatType: chatSchema.chat.chatType,
          isArchived: chatSchema.chat.isArchived,
          isDeleted: chatSchema.chat.isDeleted,
        })
        .from(chatSchema.chat)
        .where(eq(chatSchema.chat.id, chatId))
        .limit(1);

      if (!chat) {
        throw new ORPCError("NOT_FOUND", "Chat not found");
      }

      // Check if chat is deleted
      if (chat.isDeleted) {
        throw new ORPCError("NOT_FOUND", "Chat not found");
      }

      // Check ownership or permissions
      const isOwner = chat.userId === context.user.id;
      const isGroupChat = chat.chatType === "group";

      if (!isOwner && !isGroupChat) {
        throw new ORPCError("FORBIDDEN", "Access denied to this chat");
      }

      // For group chats, check if user is a participant
      if (isGroupChat) {
        // TODO: Implement group chat participant checking when group features are added
        // For now, allow access to all group chats
      }

      return next({
        context: {
          ...context,
          chat,
        },
      });
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      console.error("Chat access middleware error:", error);
      throw new ORPCError("INTERNAL_SERVER_ERROR", "Chat access verification failed");
    }
  };
};

/**
 * Message access authorization middleware
 * Checks if user has permission to access a specific message
 */
export const requireMessageAccess = (messageIdParam: string = "messageId") => {
  return async ({ context, next }: { context: EnhancedContext; next: () => any }) => {
    if (!context.user) {
      throw new ORPCError("UNAUTHORIZED", "Authentication required");
    }

    const messageId = (context as any)[messageIdParam] || (context as any).input?.[messageIdParam];
    
    if (!messageId) {
      throw new ORPCError("BAD_REQUEST", "Message ID is required");
    }

    try {
      // Get message and chat information
      const [messageData] = await db
        .select({
          messageId: chatSchema.message.id,
          chatId: chatSchema.message.chatId,
          role: chatSchema.message.role,
          isDeleted: chatSchema.message.isDeleted,
          chatUserId: chatSchema.chat.userId,
          chatType: chatSchema.chat.chatType,
          chatDeleted: chatSchema.chat.isDeleted,
        })
        .from(chatSchema.message)
        .innerJoin(chatSchema.chat, eq(chatSchema.message.chatId, chatSchema.chat.id))
        .where(eq(chatSchema.message.id, messageId))
        .limit(1);

      if (!messageData) {
        throw new ORPCError("NOT_FOUND", "Message not found");
      }

      // Check if message or chat is deleted
      if (messageData.isDeleted || messageData.chatDeleted) {
        throw new ORPCError("NOT_FOUND", "Message not found");
      }

      // Check if user has access to the chat containing this message
      const isOwner = messageData.chatUserId === context.user.id;
      const isGroupChat = messageData.chatType === "group";

      if (!isOwner && !isGroupChat) {
        throw new ORPCError("FORBIDDEN", "Access denied to this message");
      }

      return next({
        context: {
          ...context,
          message: {
            id: messageData.messageId,
            chatId: messageData.chatId,
            role: messageData.role,
          },
        },
      });
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      console.error("Message access middleware error:", error);
      throw new ORPCError("INTERNAL_SERVER_ERROR", "Message access verification failed");
    }
  };
};

/**
 * User relationship authorization middleware
 * Checks relationship between current user and target user
 */
export const requireUserRelationship = (
  targetUserIdParam: string = "userId",
  allowedRelationships: string[] = []
) => {
  return async ({ context, next }: { context: EnhancedContext; next: () => any }) => {
    if (!context.user) {
      throw new ORPCError("UNAUTHORIZED", "Authentication required");
    }

    const targetUserId = (context as any)[targetUserIdParam] || (context as any).input?.[targetUserIdParam];
    
    if (!targetUserId) {
      throw new ORPCError("BAD_REQUEST", "Target user ID is required");
    }

    // Allow self-access
    if (targetUserId === context.user.id) {
      return next();
    }

    try {
      // Get target user information
      const [targetUser] = await db
        .select({
          id: authSchema.user.id,
          isPrivate: authSchema.user.isPrivate,
          allowDirectMessages: authSchema.user.allowDirectMessages,
          isActive: authSchema.user.isActive,
          isBlocked: authSchema.user.isBlocked,
        })
        .from(authSchema.user)
        .where(eq(authSchema.user.id, targetUserId))
        .limit(1);

      if (!targetUser) {
        throw new ORPCError("NOT_FOUND", "User not found");
      }

      // Check if target user is blocked or inactive
      if (targetUser.isBlocked || !targetUser.isActive) {
        throw new ORPCError("NOT_FOUND", "User not found");
      }

      // Get relationship from current user to target user
      const relationship = context.relationships.get(targetUserId);

      // Check if user is blocked by current user
      if (relationship === "blocked") {
        throw new ORPCError("FORBIDDEN", "User is blocked");
      }

      // Get reverse relationship (from target to current user)
      const [reverseRelationship] = await db
        .select({ relationshipType: authSchema.userRelationship.relationshipType })
        .from(authSchema.userRelationship)
        .where(
          and(
            eq(authSchema.userRelationship.fromUserId, targetUserId),
            eq(authSchema.userRelationship.toUserId, context.user.id),
            eq(authSchema.userRelationship.status, "active")
          )
        )
        .limit(1);

      // Check if current user is blocked by target user
      if (reverseRelationship?.relationshipType === "blocked") {
        throw new ORPCError("FORBIDDEN", "Access denied");
      }

      // Check if specific relationships are required
      if (allowedRelationships.length > 0) {
        if (!relationship || !allowedRelationships.includes(relationship)) {
          throw new ORPCError("FORBIDDEN", "Insufficient relationship permissions");
        }
      }

      // Check privacy settings for non-friends
      if (targetUser.isPrivate && relationship !== "friend") {
        throw new ORPCError("FORBIDDEN", "User profile is private");
      }

      return next({
        context: {
          ...context,
          targetUser,
          relationship,
        },
      });
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      console.error("User relationship middleware error:", error);
      throw new ORPCError("INTERNAL_SERVER_ERROR", "Relationship verification failed");
    }
  };
};

/**
 * Permission-based authorization middleware
 * Checks if user has specific permissions
 */
export const requirePermissions = (requiredPermissions: string[]) => {
  return async ({ context, next }: { context: EnhancedContext; next: () => any }) => {
    if (!context.user) {
      throw new ORPCError("UNAUTHORIZED", "Authentication required");
    }

    if (!context.permissions) {
      throw new ORPCError("FORBIDDEN", "No permissions available");
    }

    const missingPermissions = requiredPermissions.filter(
      permission => !context.permissions.has(permission)
    );

    if (missingPermissions.length > 0) {
      throw new ORPCError(
        "FORBIDDEN", 
        `Missing permissions: ${missingPermissions.join(", ")}`
      );
    }

    return next();
  };
};

/**
 * Admin/moderator authorization middleware
 * TODO: Implement when user roles are added
 */
export const requireAdmin = async ({ context, next }: { context: EnhancedContext; next: () => any }) => {
  if (!context.user) {
    throw new ORPCError("UNAUTHORIZED", "Authentication required");
  }

  // TODO: Check user role when role system is implemented
  // For now, restrict admin operations
  throw new ORPCError("FORBIDDEN", "Admin access required");
};

/**
 * Combined middleware for common chat operations
 * Combines authentication, rate limiting, and activity tracking
 */
export const chatOperationMiddleware = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 requests per minute for chat operations
  keyGenerator: (context: Context) => {
    return `chat-ops:${context.session?.user?.id || 'anonymous'}`;
  },
});

/**
 * Middleware for typing indicator operations
 * Stricter rate limiting to prevent spam
 */
export const typingIndicatorMiddleware = createRateLimit({
  windowMs: 10 * 1000, // 10 seconds
  maxRequests: 20, // 20 typing updates per 10 seconds
  keyGenerator: (context: Context) => {
    return `typing:${context.session?.user?.id || 'anonymous'}`;
  },
});

/**
 * Middleware for presence updates
 * Moderate rate limiting for status changes
 */
export const presenceUpdateMiddleware = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 status updates per minute
  keyGenerator: (context: Context) => {
    return `presence:${context.session?.user?.id || 'anonymous'}`;
  },
});

/**
 * Utility function to create custom auth middleware with specific requirements
 */
export const createCustomAuthMiddleware = (options: {
  requireAuth?: boolean;
  requireEnhanced?: boolean;
  permissions?: string[];
  rateLimitConfig?: {
    windowMs: number;
    maxRequests: number;
  };
  allowSelfAccess?: boolean;
}) => {
  const middlewares = [];

  // Add rate limiting if specified
  if (options.rateLimitConfig) {
    middlewares.push(
      createRateLimit({
        ...options.rateLimitConfig,
        keyGenerator: (context: Context) => {
          return `custom:${context.session?.user?.id || 'anonymous'}`;
        },
      })
    );
  }

  // Add authentication middleware
  if (options.requireEnhanced) {
    middlewares.push(requireEnhancedAuth);
  } else if (options.requireAuth !== false) {
    middlewares.push(requireAuth);
  }

  // Add permission middleware
  if (options.permissions && options.permissions.length > 0) {
    middlewares.push(requirePermissions(options.permissions));
  }

  return middlewares;
};

// Export commonly used middleware combinations
export const commonMiddleware = {
  // Basic auth + activity tracking
  basicAuth: [requireAuth],
  
  // Enhanced auth with profile and relationships
  enhancedAuth: [requireEnhancedAuth],
  
  // Chat operations with rate limiting
  chatOps: [chatOperationMiddleware, requireEnhancedAuth],
  
  // Message operations
  messageOps: [chatOperationMiddleware, requireEnhancedAuth],
  
  // Presence operations
  presenceOps: [presenceUpdateMiddleware, requireAuth],
  
  // Typing indicators
  typing: [typingIndicatorMiddleware, requireAuth],
  
  // Profile operations
  profileOps: [requireEnhancedAuth],
  
  // Admin operations (restricted for now)
  admin: [requireAdmin],
};