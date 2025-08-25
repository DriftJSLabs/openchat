import { db } from "../db";
import * as schema from "../db/schema/auth";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { 
  UserPresence, 
  InsertUserPresence,
  UpdatePresence,
  TypingIndicator 
} from "./auth-validation";

/**
 * Real-time user presence tracking service
 * Handles online/offline status, typing indicators, and activity monitoring
 * Optimized for chat applications with WebSocket integration
 */

export class PresenceService {
  private presenceCleanupInterval: Timer | null = null;
  private readonly PRESENCE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly TYPING_TIMEOUT = 3 * 1000; // 3 seconds
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute

  constructor() {
    // Start background cleanup process
    this.startPresenceCleanup();
  }

  /**
   * Update user presence status and activity
   * @param userId - User ID to update
   * @param presenceData - Presence information to update
   */
  async updatePresence(userId: string, presenceData: Partial<{
    status: "online" | "away" | "busy" | "offline";
    customStatus?: string;
    deviceId?: string;
    sessionId?: string;
    connectionId?: string;
    platform?: "web" | "mobile" | "desktop" | "tablet";
    appVersion?: string;
    connectionCount?: number;
    lastIpAddress?: string;
    userAgent?: string;
  }>): Promise<UserPresence> {
    const now = new Date();
    
    try {
      // Upsert presence record
      const [updatedPresence] = await db
        .insert(schema.userPresence)
        .values({
          id: nanoid(),
          userId,
          status: presenceData.status || "online",
          customStatus: presenceData.customStatus,
          deviceId: presenceData.deviceId,
          sessionId: presenceData.sessionId,
          connectionId: presenceData.connectionId,
          platform: presenceData.platform,
          appVersion: presenceData.appVersion,
          connectionCount: presenceData.connectionCount || 1,
          lastIpAddress: presenceData.lastIpAddress,
          userAgent: presenceData.userAgent,
          lastActiveAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.userPresence.userId,
          set: {
            status: presenceData.status || "online",
            customStatus: presenceData.customStatus,
            deviceId: presenceData.deviceId,
            sessionId: presenceData.sessionId,
            connectionId: presenceData.connectionId,
            platform: presenceData.platform,
            appVersion: presenceData.appVersion,
            connectionCount: presenceData.connectionCount,
            lastIpAddress: presenceData.lastIpAddress,
            userAgent: presenceData.userAgent,
            lastActiveAt: now,
            updatedAt: now,
          },
        })
        .returning();

      // Also update the user table for quick status lookups
      await db
        .update(schema.user)
        .set({
          status: presenceData.status,
          lastActiveAt: now,
          updatedAt: now,
        })
        .where(eq(schema.user.id, userId));

      return updatedPresence;
    } catch (error) {
      console.error("Failed to update user presence:", error);
      throw new Error("Failed to update presence status");
    }
  }

  /**
   * Get current presence for a specific user
   * @param userId - User ID to get presence for
   * @returns User presence data or null if not found
   */
  async getPresence(userId: string): Promise<UserPresence | null> {
    try {
      const [presence] = await db
        .select()
        .from(schema.userPresence)
        .where(eq(schema.userPresence.userId, userId))
        .limit(1);

      return presence || null;
    } catch (error) {
      console.error("Failed to get user presence:", error);
      return null;
    }
  }

  /**
   * Get presence for multiple users
   * @param userIds - Array of user IDs
   * @returns Map of user ID to presence data
   */
  async getMultiplePresence(userIds: string[]): Promise<Map<string, UserPresence>> {
    if (userIds.length === 0) {
      return new Map();
    }

    try {
      const presences = await db
        .select()
        .from(schema.userPresence)
        .where(inArray(schema.userPresence.userId, userIds));

      const presenceMap = new Map<string, UserPresence>();
      presences.forEach(presence => {
        presenceMap.set(presence.userId, presence);
      });

      return presenceMap;
    } catch (error) {
      console.error("Failed to get multiple user presence:", error);
      return new Map();
    }
  }

  /**
   * Set user as online and increment connection count
   * @param userId - User ID
   * @param connectionData - Connection information
   */
  async setOnline(userId: string, connectionData: {
    sessionId?: string;
    connectionId?: string;
    deviceId?: string;
    platform?: "web" | "mobile" | "desktop" | "tablet";
    appVersion?: string;
    lastIpAddress?: string;
    userAgent?: string;
  } = {}): Promise<void> {
    const currentPresence = await this.getPresence(userId);
    const newConnectionCount = (currentPresence?.connectionCount || 0) + 1;

    await this.updatePresence(userId, {
      status: "online",
      connectionCount: newConnectionCount,
      ...connectionData,
    });
  }

  /**
   * Set user as offline and decrement connection count
   * @param userId - User ID
   * @param connectionId - Specific connection to remove
   */
  async setOffline(userId: string, connectionId?: string): Promise<void> {
    const currentPresence = await this.getPresence(userId);
    if (!currentPresence) return;

    const newConnectionCount = Math.max(0, currentPresence.connectionCount - 1);
    const isLastConnection = newConnectionCount === 0;

    await this.updatePresence(userId, {
      status: isLastConnection ? "offline" : currentPresence.status,
      connectionCount: newConnectionCount,
      connectionId: isLastConnection ? null : currentPresence.connectionId,
    });
  }

  /**
   * Update typing indicator for a user in a specific chat
   * @param userId - User ID
   * @param chatId - Chat ID where user is typing
   * @param isTyping - Whether user is currently typing
   */
  async updateTypingIndicator(userId: string, chatId: string, isTyping: boolean): Promise<void> {
    try {
      await db
        .update(schema.userPresence)
        .set({
          isTyping,
          typingIn: isTyping ? chatId : null,
          typingLastUpdate: isTyping ? new Date() : null,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.userPresence.userId, userId));
    } catch (error) {
      console.error("Failed to update typing indicator:", error);
      throw new Error("Failed to update typing indicator");
    }
  }

  /**
   * Get users currently typing in a specific chat
   * @param chatId - Chat ID to check for typing users
   * @returns Array of user IDs who are typing
   */
  async getTypingUsers(chatId: string): Promise<string[]> {
    try {
      const cutoffTime = new Date(Date.now() - this.TYPING_TIMEOUT);
      
      const typingUsers = await db
        .select({ userId: schema.userPresence.userId })
        .from(schema.userPresence)
        .where(
          and(
            eq(schema.userPresence.typingIn, chatId),
            eq(schema.userPresence.isTyping, true),
            gte(schema.userPresence.typingLastUpdate, cutoffTime)
          )
        );

      return typingUsers.map(user => user.userId);
    } catch (error) {
      console.error("Failed to get typing users:", error);
      return [];
    }
  }

  /**
   * Get all online users
   * @param limit - Maximum number of users to return
   * @returns Array of online user presence data
   */
  async getOnlineUsers(limit: number = 100): Promise<UserPresence[]> {
    try {
      const onlineUsers = await db
        .select()
        .from(schema.userPresence)
        .where(eq(schema.userPresence.status, "online"))
        .limit(limit);

      return onlineUsers;
    } catch (error) {
      console.error("Failed to get online users:", error);
      return [];
    }
  }

  /**
   * Update user activity timestamp
   * @param userId - User ID to update activity for
   */
  async updateActivity(userId: string): Promise<void> {
    try {
      await db
        .update(schema.userPresence)
        .set({
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.userPresence.userId, userId));
    } catch (error) {
      console.error("Failed to update user activity:", error);
    }
  }

  /**
   * Get user activity statistics
   * @param userId - User ID to get stats for
   * @returns Activity statistics
   */
  async getUserActivityStats(userId: string): Promise<{
    status: string;
    lastActiveAt: Date | null;
    connectionCount: number;
    totalSessions: number;
  } | null> {
    try {
      const [presence] = await db
        .select({
          status: schema.userPresence.status,
          lastActiveAt: schema.userPresence.lastActiveAt,
          connectionCount: schema.userPresence.connectionCount,
        })
        .from(schema.userPresence)
        .where(eq(schema.userPresence.userId, userId))
        .limit(1);

      if (!presence) return null;

      // Get total session count from user sessions table
      const [sessionCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.userSession)
        .where(eq(schema.userSession.userId, userId));

      return {
        status: presence.status,
        lastActiveAt: presence.lastActiveAt,
        connectionCount: presence.connectionCount,
        totalSessions: sessionCount?.count || 0,
      };
    } catch (error) {
      console.error("Failed to get user activity stats:", error);
      return null;
    }
  }

  /**
   * Cleanup stale presence data and typing indicators
   * Automatically called periodically via background process
   */
  async cleanupStaleData(): Promise<void> {
    try {
      const now = new Date();
      const presenceTimeout = new Date(now.getTime() - this.PRESENCE_TIMEOUT);
      const typingTimeout = new Date(now.getTime() - this.TYPING_TIMEOUT);

      // Clean up stale typing indicators
      await db
        .update(schema.userPresence)
        .set({
          isTyping: false,
          typingIn: null,
          typingLastUpdate: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.userPresence.isTyping, true),
            sql`${schema.userPresence.typingLastUpdate} IS NOT NULL`,
            lte(schema.userPresence.typingLastUpdate, typingTimeout)
          )
        );

      // Set users with stale presence as offline
      await db
        .update(schema.userPresence)
        .set({
          status: "offline",
          connectionCount: 0,
          connectionId: null,
          updatedAt: now,
        })
        .where(
          and(
            inArray(schema.userPresence.status, ["online", "away", "busy"]),
            lte(schema.userPresence.lastActiveAt, presenceTimeout)
          )
        );

      // Also update user table status
      await db
        .update(schema.user)
        .set({
          status: "offline",
          updatedAt: now,
        })
        .where(
          and(
            inArray(schema.user.status, ["online", "away", "busy"]),
            lte(schema.user.lastActiveAt, presenceTimeout)
          )
        );

      console.log("Presence cleanup completed");
    } catch (error) {
      console.error("Failed to cleanup stale presence data:", error);
    }
  }

  /**
   * Start background process for cleaning up stale presence data
   */
  private startPresenceCleanup(): void {
    if (this.presenceCleanupInterval) {
      clearInterval(this.presenceCleanupInterval);
    }

    this.presenceCleanupInterval = setInterval(async () => {
      try {
        await this.cleanupStaleData();
      } catch (error) {
        console.error("Presence cleanup error (non-fatal):", error);
      }
    }, this.CLEANUP_INTERVAL);

    console.log("Presence cleanup service started");
  }

  /**
   * Stop background cleanup process
   */
  stopPresenceCleanup(): void {
    if (this.presenceCleanupInterval) {
      clearInterval(this.presenceCleanupInterval);
      this.presenceCleanupInterval = null;
      console.log("Presence cleanup service stopped");
    }
  }

  /**
   * Get presence service statistics
   * @returns Service statistics
   */
  async getServiceStats(): Promise<{
    totalUsers: number;
    onlineUsers: number;
    awayUsers: number;
    busyUsers: number;
    offlineUsers: number;
    activeTypingUsers: number;
    totalConnections: number;
  }> {
    try {
      const [stats] = await db
        .select({
          totalUsers: sql<number>`count(*)`,
          onlineUsers: sql<number>`count(*) filter (where status = 'online')`,
          awayUsers: sql<number>`count(*) filter (where status = 'away')`,
          busyUsers: sql<number>`count(*) filter (where status = 'busy')`,
          offlineUsers: sql<number>`count(*) filter (where status = 'offline')`,
          activeTypingUsers: sql<number>`count(*) filter (where is_typing = true)`,
          totalConnections: sql<number>`sum(connection_count)`,
        })
        .from(schema.userPresence);

      return stats || {
        totalUsers: 0,
        onlineUsers: 0,
        awayUsers: 0,
        busyUsers: 0,
        offlineUsers: 0,
        activeTypingUsers: 0,
        totalConnections: 0,
      };
    } catch (error) {
      console.error("Failed to get service stats:", error);
      return {
        totalUsers: 0,
        onlineUsers: 0,
        awayUsers: 0,
        busyUsers: 0,
        offlineUsers: 0,
        activeTypingUsers: 0,
        totalConnections: 0,
      };
    }
  }
}

// Create singleton instance
export const presenceService = new PresenceService();

// Export helper functions for easy access
export const presenceHelpers = {
  updatePresence: presenceService.updatePresence.bind(presenceService),
  getPresence: presenceService.getPresence.bind(presenceService),
  setOnline: presenceService.setOnline.bind(presenceService),
  setOffline: presenceService.setOffline.bind(presenceService),
  updateTypingIndicator: presenceService.updateTypingIndicator.bind(presenceService),
  getTypingUsers: presenceService.getTypingUsers.bind(presenceService),
  updateActivity: presenceService.updateActivity.bind(presenceService),
};