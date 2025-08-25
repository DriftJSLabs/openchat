import type { Context as HonoContext } from "hono";
import { createAuth, getEnhancedSession } from "./auth";
import { db } from "../db";
import * as authSchema from "../db/schema/auth";
import { eq, and } from "drizzle-orm";
import { presenceHelpers } from "./presence-service";

export type CreateContextOptions = {
  context: HonoContext;
};

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  username?: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  status?: string;
  isPrivate?: boolean;
  allowDirectMessages?: boolean;
  showOnlineStatus?: boolean;
}

export interface UserPresenceInfo {
  status: string;
  customStatus?: string;
  lastActiveAt?: Date;
  isTyping?: boolean;
  connectionCount?: number;
}

export interface UserRelationshipInfo {
  relationships: Map<string, string>; // userId -> relationshipType
  blockedUsers: Set<string>;
  friends: Set<string>;
  mutedUsers: Set<string>;
}

export interface EnhancedSession {
  user: UserProfile;
  presence?: UserPresenceInfo;
  relationships?: UserRelationshipInfo;
  permissions?: Set<string>;
}

export interface RateLimitInfo {
  totalRequests: number;
  remainingRequests: number;
  resetTime: Date;
  windowMs: number;
}

/**
 * Create request context with enhanced authentication and user data
 * Includes user profile, presence, relationships, and permissions
 */
export async function createContext({ context }: CreateContextOptions) {
  try {
    const auth = createAuth();
    const session = await auth.api.getSession({
      headers: context.req.raw.headers,
    });
    
    // Basic context for unauthenticated requests
    const baseContext = {
      session,
      userAgent: context.req.header("User-Agent"),
      ipAddress: context.req.header("CF-Connecting-IP") || 
                 context.req.header("X-Forwarded-For") || 
                 "unknown",
      origin: context.req.header("Origin"),
      referer: context.req.header("Referer"),
      rateLimit: undefined as RateLimitInfo | undefined,
    };
    
    // Return basic context if no session
    if (!session?.user) {
      return baseContext;
    }
    
    // For authenticated users, fetch enhanced profile data
    const enhancedSession = await createEnhancedSession(session.user.id);
    
    return {
      ...baseContext,
      session,
      enhancedSession,
    };
  } catch (error) {
    console.warn('[Auth] Failed to get session:', error);
    return {
      session: null,
      userAgent: context.req.header("User-Agent"),
      ipAddress: context.req.header("CF-Connecting-IP") || 
                 context.req.header("X-Forwarded-For") || 
                 "unknown",
      origin: context.req.header("Origin"),
      referer: context.req.header("Referer"),
      rateLimit: undefined as RateLimitInfo | undefined,
    };
  }
}

/**
 * Create enhanced session with user profile, presence, and relationship data
 * @param userId - User ID to create enhanced session for
 * @returns Enhanced session object with all user data
 */
export async function createEnhancedSession(userId: string): Promise<EnhancedSession | null> {
  try {
    // Get comprehensive user profile data
    const [userProfile] = await db
      .select({
        id: authSchema.user.id,
        name: authSchema.user.name,
        email: authSchema.user.email,
        username: authSchema.user.username,
        displayName: authSchema.user.displayName,
        bio: authSchema.user.bio,
        avatar: authSchema.user.avatar,
        status: authSchema.user.status,
        isPrivate: authSchema.user.isPrivate,
        allowDirectMessages: authSchema.user.allowDirectMessages,
        showOnlineStatus: authSchema.user.showOnlineStatus,
      })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId))
      .limit(1);
      
    if (!userProfile) {
      return null;
    }
    
    // Get user presence information
    const presence = await presenceHelpers.getPresence(userId);
    const presenceInfo: UserPresenceInfo | undefined = presence ? {
      status: presence.status,
      customStatus: presence.customStatus || undefined,
      lastActiveAt: presence.lastActiveAt,
      isTyping: presence.isTyping || false,
      connectionCount: presence.connectionCount || 0,
    } : undefined;
    
    // Get user relationships
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
    
    // Organize relationships by type for quick lookups
    const relationshipMap = new Map<string, string>();
    const blockedUsers = new Set<string>();
    const friends = new Set<string>();
    const mutedUsers = new Set<string>();
    
    relationships.forEach(rel => {
      relationshipMap.set(rel.toUserId, rel.relationshipType);
      
      switch (rel.relationshipType) {
        case "blocked":
          blockedUsers.add(rel.toUserId);
          break;
        case "friend":
          friends.add(rel.toUserId);
          break;
        case "muted":
          mutedUsers.add(rel.toUserId);
          break;
      }
    });
    
    const relationshipInfo: UserRelationshipInfo = {
      relationships: relationshipMap,
      blockedUsers,
      friends,
      mutedUsers,
    };
    
    // Define user permissions based on account status and type
    const permissions = new Set<string>([
      "chat:read",
      "chat:create",
      "message:read",
      "message:create",
      "profile:read",
      "profile:update",
      "presence:update",
      "relationship:create",
      "relationship:read",
    ]);
    
    // Add additional permissions based on user status
    if (userProfile.status !== "offline") {
      permissions.add("realtime:connect");
    }
    
    return {
      user: userProfile,
      presence: presenceInfo,
      relationships: relationshipInfo,
      permissions,
    };
  } catch (error) {
    console.error("Failed to create enhanced session:", error);
    return null;
  }
}

/**
 * Utility function to get user's blocked users list
 * @param userId - User ID
 * @returns Set of blocked user IDs
 */
export async function getUserBlockedUsers(userId: string): Promise<Set<string>> {
  try {
    const blockedUsers = await db
      .select({ toUserId: authSchema.userRelationship.toUserId })
      .from(authSchema.userRelationship)
      .where(
        and(
          eq(authSchema.userRelationship.fromUserId, userId),
          eq(authSchema.userRelationship.relationshipType, "blocked"),
          eq(authSchema.userRelationship.status, "active")
        )
      );
    
    return new Set(blockedUsers.map(rel => rel.toUserId));
  } catch (error) {
    console.error("Failed to get blocked users:", error);
    return new Set();
  }
}

/**
 * Utility function to get user's friends list
 * @param userId - User ID
 * @returns Set of friend user IDs
 */
export async function getUserFriends(userId: string): Promise<Set<string>> {
  try {
    const friends = await db
      .select({ toUserId: authSchema.userRelationship.toUserId })
      .from(authSchema.userRelationship)
      .where(
        and(
          eq(authSchema.userRelationship.fromUserId, userId),
          eq(authSchema.userRelationship.relationshipType, "friend"),
          eq(authSchema.userRelationship.status, "accepted")
        )
      );
    
    return new Set(friends.map(rel => rel.toUserId));
  } catch (error) {
    console.error("Failed to get friends:", error);
    return new Set();
  }
}

/**
 * Check if two users have a specific relationship
 * @param fromUserId - Source user ID
 * @param toUserId - Target user ID  
 * @param relationshipType - Type of relationship to check
 * @returns Boolean indicating if relationship exists
 */
export async function checkUserRelationship(
  fromUserId: string, 
  toUserId: string, 
  relationshipType: string
): Promise<boolean> {
  try {
    const [relationship] = await db
      .select({ id: authSchema.userRelationship.id })
      .from(authSchema.userRelationship)
      .where(
        and(
          eq(authSchema.userRelationship.fromUserId, fromUserId),
          eq(authSchema.userRelationship.toUserId, toUserId),
          eq(authSchema.userRelationship.relationshipType, relationshipType),
          eq(authSchema.userRelationship.status, "active")
        )
      )
      .limit(1);
    
    return !!relationship;
  } catch (error) {
    console.error("Failed to check user relationship:", error);
    return false;
  }
}
export type Context = Awaited<ReturnType<typeof createContext>>;

// Enhanced context type for middleware that adds user data
export type EnhancedContext = Context & {
  user: UserProfile;
  enhancedSession: EnhancedSession;
  permissions: Set<string>;
  relationships: UserRelationshipInfo;
  chat?: any; // Chat data added by chat middleware
  message?: any; // Message data added by message middleware
  targetUser?: any; // Target user data added by relationship middleware
};

// Type guards for context types
export function isEnhancedContext(context: Context): context is EnhancedContext {
  return !!(context as EnhancedContext).user && !!(context as EnhancedContext).enhancedSession;
}

export function hasValidSession(context: Context): context is Context & { session: NonNullable<Context['session']> } {
  return !!context.session?.user;
}
