import { o, publicProcedure } from "../lib/orpc";
import { db } from "../db";
import * as authSchema from "../db/schema/auth";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { 
  authSchemas,
  userIdSchema,
  relationshipFilterSchema,
  bulkUserActionSchema
} from "../lib/auth-validation";
import { 
  requireEnhancedAuth,
  requireUserRelationship,
  commonMiddleware 
} from "../middleware/auth-middleware";
import type { EnhancedContext } from "../lib/context";

/**
 * User Relationship Management Router
 * Handles friend requests, blocking, muting, following, and other social relationships
 * Implements proper privacy controls and relationship state management
 */

export const userRelationshipsRouter = o.router({
  /**
   * Send friend request or create relationship
   */
  createRelationship: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .input(authSchemas.createRelationship)
    .output(z.object({ 
      success: z.boolean(), 
      message: z.string(),
      relationshipId: z.string().optional()
    }))
    .handler(async ({ input, context }) => {
      const { user } = context as EnhancedContext;
      const { toUserId, relationshipType, metadata } = input;
      
      // Prevent self-relationships
      if (toUserId === user.id) {
        throw new ORPCError("BAD_REQUEST", "Cannot create relationship with yourself");
      }
      
      try {
        // Check if target user exists and is active
        const [targetUser] = await db
          .select({
            id: authSchema.user.id,
            name: authSchema.user.name,
            isActive: authSchema.user.isActive,
            isBlocked: authSchema.user.isBlocked,
            allowFriendRequests: authSchema.user.allowFriendRequests,
            isPrivate: authSchema.user.isPrivate,
          })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, toUserId))
          .limit(1);
          
        if (!targetUser || !targetUser.isActive || targetUser.isBlocked) {
          throw new ORPCError("NOT_FOUND", "User not found");
        }
        
        // Check if relationship already exists
        const [existingRelationship] = await db
          .select({
            id: authSchema.userRelationship.id,
            relationshipType: authSchema.userRelationship.relationshipType,
            status: authSchema.userRelationship.status,
          })
          .from(authSchema.userRelationship)
          .where(
            and(
              eq(authSchema.userRelationship.fromUserId, user.id),
              eq(authSchema.userRelationship.toUserId, toUserId),
              eq(authSchema.userRelationship.relationshipType, relationshipType)
            )
          )
          .limit(1);
          
        if (existingRelationship) {
          if (existingRelationship.status === "active") {
            throw new ORPCError("CONFLICT", `${relationshipType} relationship already exists`);
          }
          // Update existing inactive relationship
          await db
            .update(authSchema.userRelationship)
            .set({
              status: "active",
              metadata: metadata,
              updatedAt: new Date(),
            })
            .where(eq(authSchema.userRelationship.id, existingRelationship.id));
            
          return {
            success: true,
            message: `${relationshipType} relationship updated`,
            relationshipId: existingRelationship.id,
          };
        }
        
        // Check if we're blocked by target user
        const [blockedByTarget] = await db
          .select({ id: authSchema.userRelationship.id })
          .from(authSchema.userRelationship)
          .where(
            and(
              eq(authSchema.userRelationship.fromUserId, toUserId),
              eq(authSchema.userRelationship.toUserId, user.id),
              eq(authSchema.userRelationship.relationshipType, "blocked"),
              eq(authSchema.userRelationship.status, "active")
            )
          )
          .limit(1);
          
        if (blockedByTarget) {
          throw new ORPCError("FORBIDDEN", "Cannot create relationship with this user");
        }
        
        // Special handling for friend requests
        if (relationshipType === "friend") {
          if (!targetUser.allowFriendRequests) {
            throw new ORPCError("FORBIDDEN", "User does not accept friend requests");
          }
          
          // Check for mutual friend request (auto-accept)
          const [mutualRequest] = await db
            .select({ id: authSchema.userRelationship.id })
            .from(authSchema.userRelationship)
            .where(
              and(
                eq(authSchema.userRelationship.fromUserId, toUserId),
                eq(authSchema.userRelationship.toUserId, user.id),
                eq(authSchema.userRelationship.relationshipType, "friend"),
                eq(authSchema.userRelationship.status, "pending")
              )
            )
            .limit(1);
            
          const relationshipStatus = mutualRequest ? "accepted" : "pending";
          const relationshipId = nanoid();
          
          // Create the relationship
          await db.insert(authSchema.userRelationship).values({
            id: relationshipId,
            fromUserId: user.id,
            toUserId: toUserId,
            relationshipType: "friend",
            status: relationshipStatus,
            metadata: metadata,
          });
          
          // If mutual request, update both relationships to accepted
          if (mutualRequest) {
            await db
              .update(authSchema.userRelationship)
              .set({
                status: "accepted",
                updatedAt: new Date(),
              })
              .where(eq(authSchema.userRelationship.id, mutualRequest.id));
          }
          
          return {
            success: true,
            message: mutualRequest ? "Friend request accepted!" : "Friend request sent",
            relationshipId,
          };
        }
        
        // For other relationship types (block, mute, follow, etc.)
        const relationshipId = nanoid();
        await db.insert(authSchema.userRelationship).values({
          id: relationshipId,
          fromUserId: user.id,
          toUserId: toUserId,
          relationshipType: relationshipType,
          status: "active",
          metadata: metadata,
        });
        
        return {
          success: true,
          message: `${relationshipType} relationship created`,
          relationshipId,
        };
      } catch (error) {
        console.error("Failed to create relationship:", error);
        if (error instanceof ORPCError) throw error;
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to create relationship");
      }
    }),

  /**
   * Accept or decline friend request
   */
  respondToFriendRequest: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .input(z.object({
      fromUserId: userIdSchema,
      action: z.enum(["accept", "decline"]),
    }))
    .output(z.object({ success: z.boolean(), message: z.string() }))
    .handler(async ({ input, context }) => {
      const { user } = context as EnhancedContext;
      const { fromUserId, action } = input;
      
      try {
        // Find the pending friend request
        const [friendRequest] = await db
          .select({
            id: authSchema.userRelationship.id,
            status: authSchema.userRelationship.status,
          })
          .from(authSchema.userRelationship)
          .where(
            and(
              eq(authSchema.userRelationship.fromUserId, fromUserId),
              eq(authSchema.userRelationship.toUserId, user.id),
              eq(authSchema.userRelationship.relationshipType, "friend"),
              eq(authSchema.userRelationship.status, "pending")
            )
          )
          .limit(1);
          
        if (!friendRequest) {
          throw new ORPCError("NOT_FOUND", "Friend request not found");
        }
        
        if (action === "accept") {
          // Accept the friend request
          await db
            .update(authSchema.userRelationship)
            .set({
              status: "accepted",
              updatedAt: new Date(),
            })
            .where(eq(authSchema.userRelationship.id, friendRequest.id));
            
          return {
            success: true,
            message: "Friend request accepted",
          };
        } else {
          // Decline the friend request
          await db
            .update(authSchema.userRelationship)
            .set({
              status: "declined",
              updatedAt: new Date(),
            })
            .where(eq(authSchema.userRelationship.id, friendRequest.id));
            
          return {
            success: true,
            message: "Friend request declined",
          };
        }
      } catch (error) {
        console.error("Failed to respond to friend request:", error);
        if (error instanceof ORPCError) throw error;
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to respond to friend request");
      }
    }),

  /**
   * Remove relationship (unfriend, unblock, unmute, etc.)
   */
  removeRelationship: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .input(z.object({
      userId: userIdSchema,
      relationshipType: z.enum(["friend", "blocked", "following", "muted", "favorite"]),
    }))
    .output(z.object({ success: z.boolean(), message: z.string() }))
    .handler(async ({ input, context }) => {
      const { user } = context as EnhancedContext;
      const { userId, relationshipType } = input;
      
      try {
        // Find and remove the relationship
        const result = await db
          .delete(authSchema.userRelationship)
          .where(
            and(
              eq(authSchema.userRelationship.fromUserId, user.id),
              eq(authSchema.userRelationship.toUserId, userId),
              eq(authSchema.userRelationship.relationshipType, relationshipType)
            )
          );
          
        // Also remove reverse relationship for friends
        if (relationshipType === "friend") {
          await db
            .delete(authSchema.userRelationship)
            .where(
              and(
                eq(authSchema.userRelationship.fromUserId, userId),
                eq(authSchema.userRelationship.toUserId, user.id),
                eq(authSchema.userRelationship.relationshipType, "friend")
              )
            );
        }
        
        return {
          success: true,
          message: `${relationshipType} relationship removed`,
        };
      } catch (error) {
        console.error("Failed to remove relationship:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to remove relationship");
      }
    }),

  /**
   * Get user's relationships with filtering and pagination
   */
  getRelationships: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .input(relationshipFilterSchema)
    .output(
      z.object({
        relationships: z.array(
          z.object({
            id: z.string(),
            user: z.object({
              id: z.string(),
              name: z.string(),
              username: z.string().nullable(),
              displayName: z.string().nullable(),
              avatar: z.string().nullable(),
              status: z.string(),
              isOnline: z.boolean(),
              isVerified: z.boolean(),
            }),
            relationshipType: z.string(),
            status: z.string(),
            createdAt: z.date(),
            updatedAt: z.date(),
          })
        ),
        total: z.number(),
        hasMore: z.boolean(),
      })
    )
    .handler(async ({ input, context }) => {
      const { user } = context as EnhancedContext;
      const { 
        relationshipType, 
        status, 
        limit, 
        offset, 
        sortBy, 
        sortOrder 
      } = input;
      
      try {
        // Build query conditions
        let whereConditions = eq(authSchema.userRelationship.fromUserId, user.id);
        
        if (relationshipType) {
          whereConditions = and(
            whereConditions,
            eq(authSchema.userRelationship.relationshipType, relationshipType)
          );
        }
        
        if (status) {
          whereConditions = and(
            whereConditions,
            eq(authSchema.userRelationship.status, status)
          );
        }
        
        // Get total count
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(authSchema.userRelationship)
          .where(whereConditions);
          
        const total = countResult?.count || 0;
        
        // Get relationships with user data
        const relationships = await db
          .select({
            id: authSchema.userRelationship.id,
            relationshipType: authSchema.userRelationship.relationshipType,
            status: authSchema.userRelationship.status,
            createdAt: authSchema.userRelationship.createdAt,
            updatedAt: authSchema.userRelationship.updatedAt,
            // User data
            userId: authSchema.user.id,
            userName: authSchema.user.name,
            username: authSchema.user.username,
            displayName: authSchema.user.displayName,
            avatar: authSchema.user.avatar,
            userStatus: authSchema.user.status,
            showOnlineStatus: authSchema.user.showOnlineStatus,
            isVerified: authSchema.user.isVerified,
          })
          .from(authSchema.userRelationship)
          .innerJoin(
            authSchema.user,
            eq(authSchema.userRelationship.toUserId, authSchema.user.id)
          )
          .where(whereConditions)
          .limit(limit)
          .offset(offset)
          .orderBy(
            sortOrder === "desc"
              ? sql`${authSchema.userRelationship[sortBy]} desc`
              : sql`${authSchema.userRelationship[sortBy]} asc`
          );
        
        const enrichedRelationships = relationships.map(rel => ({
          id: rel.id,
          user: {
            id: rel.userId,
            name: rel.userName,
            username: rel.username,
            displayName: rel.displayName,
            avatar: rel.avatar,
            status: rel.showOnlineStatus ? (rel.userStatus || "offline") : "offline",
            isOnline: rel.showOnlineStatus && rel.userStatus === "online",
            isVerified: rel.isVerified || false,
          },
          relationshipType: rel.relationshipType,
          status: rel.status,
          createdAt: rel.createdAt,
          updatedAt: rel.updatedAt,
        }));
        
        return {
          relationships: enrichedRelationships,
          total,
          hasMore: offset + limit < total,
        };
      } catch (error) {
        console.error("Failed to get relationships:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to get relationships");
      }
    }),

  /**
   * Get pending friend requests (both sent and received)
   */
  getFriendRequests: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .input(z.object({
      type: z.enum(["sent", "received", "all"]).default("all"),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .output(
      z.object({
        requests: z.array(
          z.object({
            id: z.string(),
            user: z.object({
              id: z.string(),
              name: z.string(),
              username: z.string().nullable(),
              displayName: z.string().nullable(),
              avatar: z.string().nullable(),
              isVerified: z.boolean(),
            }),
            direction: z.enum(["sent", "received"]),
            createdAt: z.date(),
          })
        ),
        total: z.number(),
      })
    )
    .handler(async ({ input, context }) => {
      const { user } = context as EnhancedContext;
      const { type, limit, offset } = input;
      
      try {
        let whereConditions;
        
        if (type === "sent") {
          whereConditions = and(
            eq(authSchema.userRelationship.fromUserId, user.id),
            eq(authSchema.userRelationship.relationshipType, "friend"),
            eq(authSchema.userRelationship.status, "pending")
          );
        } else if (type === "received") {
          whereConditions = and(
            eq(authSchema.userRelationship.toUserId, user.id),
            eq(authSchema.userRelationship.relationshipType, "friend"),
            eq(authSchema.userRelationship.status, "pending")
          );
        } else {
          whereConditions = and(
            or(
              eq(authSchema.userRelationship.fromUserId, user.id),
              eq(authSchema.userRelationship.toUserId, user.id)
            ),
            eq(authSchema.userRelationship.relationshipType, "friend"),
            eq(authSchema.userRelationship.status, "pending")
          );
        }
        
        // Get total count
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(authSchema.userRelationship)
          .where(whereConditions);
          
        const total = countResult?.count || 0;
        
        // Get friend requests
        const requests = await db
          .select({
            id: authSchema.userRelationship.id,
            fromUserId: authSchema.userRelationship.fromUserId,
            toUserId: authSchema.userRelationship.toUserId,
            createdAt: authSchema.userRelationship.createdAt,
            // User data (we'll join with the "other" user)
            userId: authSchema.user.id,
            userName: authSchema.user.name,
            username: authSchema.user.username,
            displayName: authSchema.user.displayName,
            avatar: authSchema.user.avatar,
            isVerified: authSchema.user.isVerified,
          })
          .from(authSchema.userRelationship)
          .innerJoin(
            authSchema.user,
            // Join with the "other" user (not the current user)
            or(
              and(
                eq(authSchema.userRelationship.fromUserId, user.id),
                eq(authSchema.userRelationship.toUserId, authSchema.user.id)
              ),
              and(
                eq(authSchema.userRelationship.toUserId, user.id),
                eq(authSchema.userRelationship.fromUserId, authSchema.user.id)
              )
            )
          )
          .where(whereConditions)
          .limit(limit)
          .offset(offset)
          .orderBy(sql`${authSchema.userRelationship.createdAt} desc`);
        
        const enrichedRequests = requests.map(req => ({
          id: req.id,
          user: {
            id: req.userId,
            name: req.userName,
            username: req.username,
            displayName: req.displayName,
            avatar: req.avatar,
            isVerified: req.isVerified || false,
          },
          direction: req.fromUserId === user.id ? "sent" : "received",
          createdAt: req.createdAt,
        }));
        
        return {
          requests: enrichedRequests,
          total,
        };
      } catch (error) {
        console.error("Failed to get friend requests:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to get friend requests");
      }
    }),

  /**
   * Bulk relationship actions (block multiple users, etc.)
   */
  bulkRelationshipAction: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .input(bulkUserActionSchema)
    .output(z.object({ 
      success: z.boolean(), 
      processed: z.number(),
      failed: z.number(),
      errors: z.array(z.string()).optional()
    }))
    .handler(async ({ input, context }) => {
      const { user } = context as EnhancedContext;
      const { userIds, action } = input;
      
      let processed = 0;
      let failed = 0;
      const errors: string[] = [];
      
      // Map actions to relationship types
      const actionMap: Record<string, { type: string; remove: boolean }> = {
        block: { type: "blocked", remove: false },
        unblock: { type: "blocked", remove: true },
        mute: { type: "muted", remove: false },
        unmute: { type: "muted", remove: true },
        favorite: { type: "favorite", remove: false },
        unfavorite: { type: "favorite", remove: true },
      };
      
      const actionConfig = actionMap[action];
      if (!actionConfig) {
        throw new ORPCError("BAD_REQUEST", "Invalid bulk action");
      }
      
      // Process each user
      for (const targetUserId of userIds) {
        try {
          if (targetUserId === user.id) {
            errors.push(`Cannot ${action} yourself`);
            failed++;
            continue;
          }
          
          if (actionConfig.remove) {
            // Remove relationship
            await db
              .delete(authSchema.userRelationship)
              .where(
                and(
                  eq(authSchema.userRelationship.fromUserId, user.id),
                  eq(authSchema.userRelationship.toUserId, targetUserId),
                  eq(authSchema.userRelationship.relationshipType, actionConfig.type)
                )
              );
          } else {
            // Create or update relationship
            const relationshipId = nanoid();
            await db
              .insert(authSchema.userRelationship)
              .values({
                id: relationshipId,
                fromUserId: user.id,
                toUserId: targetUserId,
                relationshipType: actionConfig.type,
                status: "active",
              })
              .onConflictDoUpdate({
                target: [
                  authSchema.userRelationship.fromUserId,
                  authSchema.userRelationship.toUserId,
                  authSchema.userRelationship.relationshipType,
                ],
                set: {
                  status: "active",
                  updatedAt: new Date(),
                },
              });
          }
          
          processed++;
        } catch (error) {
          console.error(`Failed to ${action} user ${targetUserId}:`, error);
          errors.push(`Failed to ${action} user ${targetUserId}`);
          failed++;
        }
      }
      
      return {
        success: failed === 0,
        processed,
        failed,
        errors: errors.length > 0 ? errors : undefined,
      };
    }),

  /**
   * Get relationship statistics for current user
   */
  getRelationshipStats: publicProcedure
    .use(...commonMiddleware.enhancedAuth)
    .output(
      z.object({
        friends: z.number(),
        blocked: z.number(),
        following: z.number(),
        muted: z.number(),
        pendingSent: z.number(),
        pendingReceived: z.number(),
      })
    )
    .handler(async ({ context }) => {
      const { user } = context as EnhancedContext;
      
      try {
        // Get all relationship counts in a single query
        const [stats] = await db
          .select({
            friends: sql<number>`count(*) filter (where relationship_type = 'friend' and status = 'accepted' and from_user_id = ${user.id})`,
            blocked: sql<number>`count(*) filter (where relationship_type = 'blocked' and status = 'active' and from_user_id = ${user.id})`,
            following: sql<number>`count(*) filter (where relationship_type = 'following' and status = 'active' and from_user_id = ${user.id})`,
            muted: sql<number>`count(*) filter (where relationship_type = 'muted' and status = 'active' and from_user_id = ${user.id})`,
            pendingSent: sql<number>`count(*) filter (where relationship_type = 'friend' and status = 'pending' and from_user_id = ${user.id})`,
            pendingReceived: sql<number>`count(*) filter (where relationship_type = 'friend' and status = 'pending' and to_user_id = ${user.id})`,
          })
          .from(authSchema.userRelationship)
          .where(
            or(
              eq(authSchema.userRelationship.fromUserId, user.id),
              and(
                eq(authSchema.userRelationship.toUserId, user.id),
                eq(authSchema.userRelationship.relationshipType, "friend"),
                eq(authSchema.userRelationship.status, "pending")
              )
            )
          );
          
        return {
          friends: stats?.friends || 0,
          blocked: stats?.blocked || 0,
          following: stats?.following || 0,
          muted: stats?.muted || 0,
          pendingSent: stats?.pendingSent || 0,
          pendingReceived: stats?.pendingReceived || 0,
        };
      } catch (error) {
        console.error("Failed to get relationship stats:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to get relationship stats");
      }
    }),
});