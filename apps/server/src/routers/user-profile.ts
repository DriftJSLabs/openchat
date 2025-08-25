import { o, publicProcedure } from "../lib/orpc";
import { db } from "../db";
import * as authSchema from "../db/schema/auth";
import { eq, and, or, ilike, inArray, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { 
  authSchemas,
  userIdSchema,
  userSearchSchema,
  paginationSchema 
} from "../lib/auth-validation";
import { 
  requireAuth, 
  requireEnhancedAuth,
  requireUserRelationship,
  commonMiddleware 
} from "../middleware/auth-middleware";
import { presenceHelpers } from "../lib/presence-service";
import type { EnhancedContext } from "../lib/context";

/**
 * User Profile Management Router
 * Handles CRUD operations for user profiles, search, and profile visibility
 * Includes privacy controls and relationship-based access
 */

export const userProfileRouter = o.router({
  /**
   * Get current user's profile
   */
  getMyProfile: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .output(
      z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        username: z.string().nullable(),
        displayName: z.string().nullable(),
        bio: z.string().nullable(),
        avatar: z.string().nullable(),
        location: z.string().nullable(),
        website: z.string().nullable(),
        timezone: z.string().nullable(),
        language: z.string(),
        status: z.string(),
        customStatus: z.string().nullable(),
        isPrivate: z.boolean(),
        allowDirectMessages: z.boolean(),
        allowFriendRequests: z.boolean(),
        showOnlineStatus: z.boolean(),
        emailNotifications: z.boolean(),
        isVerified: z.boolean(),
        loginCount: z.number(),
        lastActiveAt: z.date().nullable(),
        createdAt: z.date(),
        updatedAt: z.date(),
      })
    )
    .handler(async ({ context }) => {
      const { user } = context as EnhancedContext;
      
      try {
        const [profile] = await db
          .select({
            id: authSchema.user.id,
            name: authSchema.user.name,
            email: authSchema.user.email,
            username: authSchema.user.username,
            displayName: authSchema.user.displayName,
            bio: authSchema.user.bio,
            avatar: authSchema.user.avatar,
            location: authSchema.user.location,
            website: authSchema.user.website,
            timezone: authSchema.user.timezone,
            language: authSchema.user.language,
            status: authSchema.user.status,
            customStatus: authSchema.user.customStatus,
            isPrivate: authSchema.user.isPrivate,
            allowDirectMessages: authSchema.user.allowDirectMessages,
            allowFriendRequests: authSchema.user.allowFriendRequests,
            showOnlineStatus: authSchema.user.showOnlineStatus,
            emailNotifications: authSchema.user.emailNotifications,
            isVerified: authSchema.user.isVerified,
            loginCount: authSchema.user.loginCount,
            lastActiveAt: authSchema.user.lastActiveAt,
            createdAt: authSchema.user.createdAt,
            updatedAt: authSchema.user.updatedAt,
          })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, user.id))
          .limit(1);
          
        if (!profile) {
          throw new ORPCError("NOT_FOUND", "Profile not found");
        }
        
        return {
          ...profile,
          language: profile.language || "en",
          status: profile.status || "offline",
          loginCount: profile.loginCount || 0,
        };
      } catch (error) {
        console.error("Failed to get user profile:", error);
        if (error instanceof ORPCError) throw error;
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to retrieve profile");
      }
    }),

  /**
   * Update current user's profile
   */
  updateMyProfile: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .input(authSchemas.userProfileUpdate)
    .output(z.object({ success: z.boolean(), message: z.string() }))
    .handler(async ({ input, context }) => {
      const { user } = context as EnhancedContext;
      
      try {
        // Check if username is already taken (if provided)
        if (input.username) {
          const [existingUser] = await db
            .select({ id: authSchema.user.id })
            .from(authSchema.user)
            .where(
              and(
                eq(authSchema.user.username, input.username),
                sql`${authSchema.user.id} != ${user.id}`
              )
            )
            .limit(1);
            
          if (existingUser) {
            throw new ORPCError("CONFLICT", "Username is already taken");
          }
        }
        
        // Update user profile
        await db
          .update(authSchema.user)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(authSchema.user.id, user.id));
          
        return {
          success: true,
          message: "Profile updated successfully",
        };
      } catch (error) {
        console.error("Failed to update profile:", error);
        if (error instanceof ORPCError) throw error;
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to update profile");
      }
    }),

  /**
   * Update user status and custom status
   */
  updateStatus: publicProcedure
    .use(...commonMiddleware.presenceOps)
    .input(authSchemas.userStatusUpdate)
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input, context }) => {
      const userId = context.session?.user?.id;
      if (!userId) {
        throw new ORPCError("UNAUTHORIZED", "Authentication required");
      }
      
      try {
        // Update database
        await db
          .update(authSchema.user)
          .set({
            status: input.status,
            customStatus: input.customStatus,
            updatedAt: new Date(),
          })
          .where(eq(authSchema.user.id, userId));
          
        // Update presence service
        await presenceHelpers.updatePresence(userId, {
          status: input.status,
          customStatus: input.customStatus,
        });
        
        return { success: true };
      } catch (error) {
        console.error("Failed to update status:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to update status");
      }
    }),

  /**
   * Update privacy settings
   */
  updatePrivacySettings: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .input(authSchemas.privacySettingsUpdate)
    .output(z.object({ success: z.boolean(), message: z.string() }))
    .handler(async ({ input, context }) => {
      const { user } = context as EnhancedContext;
      
      try {
        await db
          .update(authSchema.user)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(authSchema.user.id, user.id));
          
        return {
          success: true,
          message: "Privacy settings updated successfully",
        };
      } catch (error) {
        console.error("Failed to update privacy settings:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to update privacy settings");
      }
    }),

  /**
   * Get another user's profile (respects privacy settings)
   */
  getUserProfile: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .input(z.object({ userId: userIdSchema }))
    .output(
      z.object({
        id: z.string(),
        name: z.string(),
        username: z.string().nullable(),
        displayName: z.string().nullable(),
        bio: z.string().nullable(),
        avatar: z.string().nullable(),
        location: z.string().nullable(),
        website: z.string().nullable(),
        status: z.string(),
        customStatus: z.string().nullable(),
        isPrivate: z.boolean(),
        isVerified: z.boolean(),
        lastActiveAt: z.date().nullable(),
        createdAt: z.date(),
        // Relationship-specific fields
        relationship: z.string().nullable(),
        canSendMessage: z.boolean(),
        isOnline: z.boolean(),
      })
    )
    .handler(async ({ input, context }) => {
      const { user, relationships } = context as EnhancedContext;
      const { userId } = input;
      
      // Allow self-access
      if (userId === user.id) {
        const profile = await db
          .select({
            id: authSchema.user.id,
            name: authSchema.user.name,
            username: authSchema.user.username,
            displayName: authSchema.user.displayName,
            bio: authSchema.user.bio,
            avatar: authSchema.user.avatar,
            location: authSchema.user.location,
            website: authSchema.user.website,
            status: authSchema.user.status,
            customStatus: authSchema.user.customStatus,
            isPrivate: authSchema.user.isPrivate,
            isVerified: authSchema.user.isVerified,
            lastActiveAt: authSchema.user.lastActiveAt,
            createdAt: authSchema.user.createdAt,
          })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, userId))
          .limit(1);
          
        if (!profile[0]) {
          throw new ORPCError("NOT_FOUND", "User not found");
        }
        
        return {
          ...profile[0],
          status: profile[0].status || "offline",
          relationship: null,
          canSendMessage: true,
          isOnline: profile[0].status === "online",
        };
      }
      
      try {
        // Get target user profile
        const [targetProfile] = await db
          .select({
            id: authSchema.user.id,
            name: authSchema.user.name,
            username: authSchema.user.username,
            displayName: authSchema.user.displayName,
            bio: authSchema.user.bio,
            avatar: authSchema.user.avatar,
            location: authSchema.user.location,
            website: authSchema.user.website,
            status: authSchema.user.status,
            customStatus: authSchema.user.customStatus,
            isPrivate: authSchema.user.isPrivate,
            allowDirectMessages: authSchema.user.allowDirectMessages,
            showOnlineStatus: authSchema.user.showOnlineStatus,
            isVerified: authSchema.user.isVerified,
            isActive: authSchema.user.isActive,
            isBlocked: authSchema.user.isBlocked,
            lastActiveAt: authSchema.user.lastActiveAt,
            createdAt: authSchema.user.createdAt,
          })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, userId))
          .limit(1);
          
        if (!targetProfile || !targetProfile.isActive || targetProfile.isBlocked) {
          throw new ORPCError("NOT_FOUND", "User not found");
        }
        
        // Check relationship
        const relationship = relationships.relationships.get(userId);
        
        // Check if user is blocked by current user
        if (relationship === "blocked") {
          throw new ORPCError("NOT_FOUND", "User not found");
        }
        
        // Check if current user is blocked by target user
        const [reverseRelationship] = await db
          .select({ relationshipType: authSchema.userRelationship.relationshipType })
          .from(authSchema.userRelationship)
          .where(
            and(
              eq(authSchema.userRelationship.fromUserId, userId),
              eq(authSchema.userRelationship.toUserId, user.id),
              eq(authSchema.userRelationship.relationshipType, "blocked"),
              eq(authSchema.userRelationship.status, "active")
            )
          )
          .limit(1);
          
        if (reverseRelationship) {
          throw new ORPCError("FORBIDDEN", "Access denied");
        }
        
        // Check privacy settings
        if (targetProfile.isPrivate && relationship !== "friend") {
          // Limited profile for private users
          return {
            id: targetProfile.id,
            name: targetProfile.name,
            username: targetProfile.username,
            displayName: targetProfile.displayName,
            bio: null,
            avatar: targetProfile.avatar,
            location: null,
            website: null,
            status: "offline", // Hide status for private profiles
            customStatus: null,
            isPrivate: true,
            isVerified: targetProfile.isVerified,
            lastActiveAt: null,
            createdAt: targetProfile.createdAt,
            relationship,
            canSendMessage: false,
            isOnline: false,
          };
        }
        
        // Full profile access
        const showStatus = targetProfile.showOnlineStatus || relationship === "friend";
        const status = showStatus ? (targetProfile.status || "offline") : "offline";
        const canSendMessage = targetProfile.allowDirectMessages && relationship !== "muted";
        
        return {
          id: targetProfile.id,
          name: targetProfile.name,
          username: targetProfile.username,
          displayName: targetProfile.displayName,
          bio: targetProfile.bio,
          avatar: targetProfile.avatar,
          location: targetProfile.location,
          website: targetProfile.website,
          status,
          customStatus: showStatus ? targetProfile.customStatus : null,
          isPrivate: targetProfile.isPrivate,
          isVerified: targetProfile.isVerified,
          lastActiveAt: showStatus ? targetProfile.lastActiveAt : null,
          createdAt: targetProfile.createdAt,
          relationship,
          canSendMessage,
          isOnline: status === "online",
        };
      } catch (error) {
        console.error("Failed to get user profile:", error);
        if (error instanceof ORPCError) throw error;
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to retrieve user profile");
      }
    }),

  /**
   * Search for users
   */
  searchUsers: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .input(userSearchSchema)
    .output(
      z.object({
        users: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            username: z.string().nullable(),
            displayName: z.string().nullable(),
            avatar: z.string().nullable(),
            status: z.string(),
            isVerified: z.boolean(),
            relationship: z.string().nullable(),
            isOnline: z.boolean(),
          })
        ),
        total: z.number(),
        hasMore: z.boolean(),
      })
    )
    .handler(async ({ input, context }) => {
      const { user, relationships } = context as EnhancedContext;
      const { query, limit, offset, includeBlocked, includeMuted } = input;
      
      try {
        // Build search conditions
        const searchConditions = [
          ilike(authSchema.user.name, `%${query}%`),
          ilike(authSchema.user.username, `%${query}%`),
          ilike(authSchema.user.displayName, `%${query}%`),
        ];
        
        // Exclude blocked users unless specifically requested
        let excludeUsers: string[] = [];
        if (!includeBlocked) {
          excludeUsers = Array.from(relationships.blockedUsers);
        }
        if (!includeMuted) {
          excludeUsers = [...excludeUsers, ...Array.from(relationships.mutedUsers)];
        }
        
        // Base query conditions
        let whereConditions = and(
          or(...searchConditions),
          eq(authSchema.user.isActive, true),
          eq(authSchema.user.isBlocked, false),
          sql`${authSchema.user.id} != ${user.id}` // Exclude self
        );
        
        // Add exclusions if any
        if (excludeUsers.length > 0) {
          // SECURITY: Use safe parameterized NOT IN clause to prevent SQL injection
          const { safeNotIn } = await import('../lib/security/sql-safety');
          whereConditions = and(
            whereConditions,
            safeNotIn(authSchema.user.id, excludeUsers)
          );
        }
        
        // Get total count
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(authSchema.user)
          .where(whereConditions);
          
        const total = countResult?.count || 0;
        
        // Get users
        const users = await db
          .select({
            id: authSchema.user.id,
            name: authSchema.user.name,
            username: authSchema.user.username,
            displayName: authSchema.user.displayName,
            avatar: authSchema.user.avatar,
            status: authSchema.user.status,
            showOnlineStatus: authSchema.user.showOnlineStatus,
            isVerified: authSchema.user.isVerified,
          })
          .from(authSchema.user)
          .where(whereConditions)
          .limit(limit)
          .offset(offset)
          .orderBy(authSchema.user.name);
        
        // Enrich with relationship data
        const enrichedUsers = users.map(u => {
          const relationship = relationships.relationships.get(u.id);
          const showStatus = u.showOnlineStatus || relationship === "friend";
          const status = showStatus ? (u.status || "offline") : "offline";
          
          return {
            id: u.id,
            name: u.name,
            username: u.username,
            displayName: u.displayName,
            avatar: u.avatar,
            status,
            isVerified: u.isVerified || false,
            relationship,
            isOnline: status === "online",
          };
        });
        
        return {
          users: enrichedUsers,
          total,
          hasMore: offset + limit < total,
        };
      } catch (error) {
        console.error("Failed to search users:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to search users");
      }
    }),

  /**
   * Get user activity statistics (for own profile)
   */
  getMyActivityStats: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .output(
      z.object({
        loginCount: z.number(),
        lastActiveAt: z.date().nullable(),
        accountAge: z.number(), // days since account creation
        totalSessions: z.number(),
        currentConnections: z.number(),
      })
    )
    .handler(async ({ context }) => {
      const { user } = context as EnhancedContext;
      
      try {
        // Get user stats
        const [userStats] = await db
          .select({
            loginCount: authSchema.user.loginCount,
            lastActiveAt: authSchema.user.lastActiveAt,
            createdAt: authSchema.user.createdAt,
          })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, user.id))
          .limit(1);
          
        if (!userStats) {
          throw new ORPCError("NOT_FOUND", "User not found");
        }
        
        // Get session count
        const [sessionCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(authSchema.userSession)
          .where(eq(authSchema.userSession.userId, user.id));
          
        // Get current presence
        const presence = await presenceHelpers.getPresence(user.id);
        
        // Calculate account age in days
        const accountAge = Math.floor(
          (Date.now() - userStats.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        return {
          loginCount: userStats.loginCount || 0,
          lastActiveAt: userStats.lastActiveAt,
          accountAge,
          totalSessions: sessionCount?.count || 0,
          currentConnections: presence?.connectionCount || 0,
        };
      } catch (error) {
        console.error("Failed to get activity stats:", error);
        if (error instanceof ORPCError) throw error;
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to get activity stats");
      }
    }),

  /**
   * Delete user account (soft delete)
   */
  deleteAccount: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .input(authSchemas.deleteAccount)
    .output(z.object({ success: z.boolean(), message: z.string() }))
    .handler(async ({ input, context }) => {
      const { user } = context as EnhancedContext;
      
      // TODO: Verify password when password verification is implemented
      // For now, just check the confirmation text
      
      try {
        // Soft delete: mark as deleted and anonymize data
        await db
          .update(authSchema.user)
          .set({
            isActive: false,
            isDeleted: true,
            deletedAt: new Date(),
            // Anonymize personal data
            name: "[Deleted User]",
            email: `deleted_${user.id}@example.com`,
            username: null,
            displayName: null,
            bio: null,
            avatar: null,
            location: null,
            website: null,
            status: "offline",
            customStatus: null,
            updatedAt: new Date(),
          })
          .where(eq(authSchema.user.id, user.id));
          
        // Set user as offline
        await presenceHelpers.setOffline(user.id);
        
        return {
          success: true,
          message: "Account deleted successfully",
        };
      } catch (error) {
        console.error("Failed to delete account:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to delete account");
      }
    }),
});