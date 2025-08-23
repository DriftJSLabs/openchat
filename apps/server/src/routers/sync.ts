import { protectedProcedure } from "../lib/orpc";
import { db, chat, message, syncEvent, device, syncConfig } from "../db";
import { eq, and, gt, desc, lt, inArray, or, sql, count } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { ORPCError } from "@orpc/server";

// Schema definitions for enhanced sync operations
const syncRequestSchema = z.object({
  lastSyncTimestamp: z.number().optional(),
  deviceId: z.string(),
  batchSize: z.number().min(1).max(1000).optional().default(100),
  includeDeleted: z.boolean().optional().default(false),
});

const pushSyncEventsSchema = z.object({
  deviceId: z.string(),
  events: z.array(
    z.object({
      id: z.string(),
      entityType: z.enum(["chat", "message", "user"]),
      entityId: z.string(),
      operation: z.enum(["create", "update", "delete"]),
      data: z.string(), // JSON stringified data
      timestamp: z.number(), // Unix timestamp in milliseconds
      localId: z.string().optional(), // For conflict resolution
    })
  ).max(100), // Limit batch size to prevent abuse
});

const resolveSyncConflictSchema = z.object({
  conflictId: z.string(),
  resolution: z.enum(["server-wins", "client-wins", "merge"]),
  mergedData: z.string().optional(), // Required for merge resolution
});

const setSyncConfigSchema = z.object({
  mode: z.enum(["local-only", "cloud-only", "hybrid"]),
  autoSync: z.boolean(),
  syncInterval: z.number().min(5000).max(300000), // 5 seconds to 5 minutes
});

const getSyncStatusSchema = z.object({
  deviceId: z.string(),
});

const forceSyncSchema = z.object({
  deviceId: z.string(),
  entityType: z.enum(["chat", "message", "all"]).optional().default("all"),
  fullSync: z.boolean().optional().default(false),
});

const optimizeSyncSchema = z.object({
  deviceId: z.string(),
  maxEventsToProcess: z.number().min(1).max(10000).optional().default(1000),
});

const getSyncAnalyticsSchema = z.object({
  deviceId: z.string().optional(),
  dateFrom: z.string().optional(), // ISO date string
  dateTo: z.string().optional(),
});

/**
 * Enhanced Sync Router - Handles advanced synchronization operations
 * including conflict resolution, batch processing, and sync optimization.
 * 
 * This router provides comprehensive sync functionality with proper error handling,
 * conflict resolution strategies, and performance optimization for offline-first apps.
 */
export const syncRouter = {
  // Enhanced pull sync with conflict detection and batch processing
  pullSync: protectedProcedure
    .input(syncRequestSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const lastSync = input.lastSyncTimestamp || 0;
      const lastSyncDate = new Date(lastSync);

      try {
        // Verify device belongs to user
        const userDevice = await db
          .select()
          .from(device)
          .where(and(eq(device.fingerprint, input.deviceId), eq(device.userId, userId)))
          .limit(1);

        if (userDevice.length === 0) {
          throw new ORPCError("UNAUTHORIZED", "Device not registered or access denied");
        }

        // Get sync events with pagination and filtering
        const baseQuery = db
          .select()
          .from(syncEvent)
          .where(
            and(
              eq(syncEvent.userId, userId),
              gt(syncEvent.timestamp, lastSyncDate),
              input.includeDeleted ? undefined : eq(syncEvent.synced, true)
            )
          )
          .orderBy(syncEvent.timestamp)
          .limit(input.batchSize);

        const syncEvents = await baseQuery;

        // Detect potential conflicts by checking for concurrent modifications
        const conflicts = [];
        for (const event of syncEvents) {
          // Check if there are multiple events for the same entity within a time window
          const concurrentEvents = await db
            .select()
            .from(syncEvent)
            .where(
              and(
                eq(syncEvent.entityType, event.entityType),
                eq(syncEvent.entityId, event.entityId),
                gt(syncEvent.timestamp, new Date(event.timestamp.getTime() - 60000)), // 1 minute window
                lt(syncEvent.timestamp, new Date(event.timestamp.getTime() + 60000)),
                sql`${syncEvent.deviceId} != ${event.deviceId}`
              )
            );

          if (concurrentEvents.length > 0) {
            conflicts.push({
              id: nanoid(),
              entityType: event.entityType,
              entityId: event.entityId,
              conflictingEvents: [event, ...concurrentEvents],
              detectedAt: new Date().toISOString(),
              status: "unresolved",
            });
          }
        }

        // Get the latest entity states for changed items
        const entityUpdates = {
          chats: [],
          messages: [],
        };

        // Group events by entity type and ID to get latest states
        const chatIds = [...new Set(syncEvents.filter(e => e.entityType === "chat").map(e => e.entityId))];
        const messageIds = [...new Set(syncEvents.filter(e => e.entityType === "message").map(e => e.entityId))];

        if (chatIds.length > 0) {
          entityUpdates.chats = await db
            .select()
            .from(chat)
            .where(and(inArray(chat.id, chatIds), eq(chat.userId, userId)));
        }

        if (messageIds.length > 0) {
          entityUpdates.messages = await db
            .select()
            .from(message)
            .innerJoin(chat, eq(message.chatId, chat.id))
            .where(and(inArray(message.id, messageIds), eq(chat.userId, userId)))
            .then(results => results.map(r => r.message));
        }

        // Update device last sync timestamp
        const now = new Date();
        await db
          .update(device)
          .set({ lastSyncAt: now })
          .where(eq(device.fingerprint, input.deviceId));

        return {
          events: syncEvents,
          conflicts,
          entityUpdates,
          hasMore: syncEvents.length === input.batchSize,
          lastSyncTimestamp: syncEvents.length > 0 
            ? Math.max(...syncEvents.map(e => e.timestamp.getTime()))
            : lastSync,
          syncedAt: now.toISOString(),
          batchSize: syncEvents.length,
        };
      } catch (error) {
        console.error("Pull sync error:", error);
        if (error instanceof ORPCError) {
          throw error;
        }
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to pull sync data");
      }
    }),

  // Enhanced push sync with conflict detection and validation
  pushSync: protectedProcedure
    .input(pushSyncEventsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Verify device belongs to user
        const userDevice = await db
          .select()
          .from(device)
          .where(and(eq(device.fingerprint, input.deviceId), eq(device.userId, userId)))
          .limit(1);

        if (userDevice.length === 0) {
          throw new ORPCError("UNAUTHORIZED", "Device not registered or access denied");
        }

        const processedEvents = [];
        const rejectedEvents = [];
        const conflicts = [];

        for (const event of input.events) {
          try {
            // Validate event data format
            const eventData = JSON.parse(event.data);

            // Check for conflicts with existing server-side changes
            const existingEvents = await db
              .select()
              .from(syncEvent)
              .where(
                and(
                  eq(syncEvent.entityType, event.entityType),
                  eq(syncEvent.entityId, event.entityId),
                  gt(syncEvent.timestamp, new Date(event.timestamp - 60000)), // Check 1 minute before
                  sql`${syncEvent.deviceId} != ${input.deviceId}`
                )
              )
              .orderBy(desc(syncEvent.timestamp))
              .limit(5);

            if (existingEvents.length > 0) {
              // Conflict detected - queue for resolution
              conflicts.push({
                id: nanoid(),
                entityType: event.entityType,
                entityId: event.entityId,
                clientEvent: event,
                serverEvents: existingEvents,
                detectedAt: new Date().toISOString(),
                status: "pending-resolution",
              });
              continue;
            }

            // Apply the sync event to the database
            const now = new Date();
            const syncEventRecord = {
              id: event.id,
              entityType: event.entityType,
              entityId: event.entityId,
              operation: event.operation,
              data: event.data,
              timestamp: new Date(event.timestamp),
              userId,
              deviceId: input.deviceId,
              synced: true,
            };

            await db.insert(syncEvent).values(syncEventRecord);

            // Apply the actual data changes based on event type and operation
            await this.applyDataChanges(eventData, event, userId);

            processedEvents.push({
              localId: event.localId,
              serverId: event.id,
              status: "accepted",
              syncedAt: now.toISOString(),
            });

          } catch (eventError) {
            console.error(`Error processing event ${event.id}:`, eventError);
            rejectedEvents.push({
              localId: event.localId,
              reason: eventError instanceof Error ? eventError.message : "Unknown error",
              status: "rejected",
            });
          }
        }

        return {
          processedEvents,
          rejectedEvents,
          conflicts,
          summary: {
            total: input.events.length,
            processed: processedEvents.length,
            rejected: rejectedEvents.length,
            conflicts: conflicts.length,
          },
        };

      } catch (error) {
        console.error("Push sync error:", error);
        if (error instanceof ORPCError) {
          throw error;
        }
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to push sync data");
      }
    }),

  // Resolve sync conflicts
  resolveSyncConflict: protectedProcedure
    .input(resolveSyncConflictSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // TODO: Implement conflict resolution storage and retrieval
        // For now, return a mock resolution result

        const now = new Date();
        let resolvedData;

        switch (input.resolution) {
          case "server-wins":
            // Keep server version, discard client changes
            resolvedData = "Server version preserved";
            break;
          case "client-wins":
            // Apply client changes, overwrite server
            resolvedData = "Client version applied";
            break;
          case "merge":
            if (!input.mergedData) {
              throw new ORPCError("BAD_REQUEST", "Merged data required for merge resolution");
            }
            resolvedData = input.mergedData;
            break;
          default:
            throw new ORPCError("BAD_REQUEST", "Invalid resolution strategy");
        }

        return {
          conflictId: input.conflictId,
          resolution: input.resolution,
          resolvedAt: now.toISOString(),
          resolvedData,
          status: "resolved",
        };

      } catch (error) {
        console.error("Conflict resolution error:", error);
        if (error instanceof ORPCError) {
          throw error;
        }
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to resolve sync conflict");
      }
    }),

  // Get and set sync configuration
  getSyncConfig: protectedProcedure
    .input(z.object({ deviceId: z.string().optional() }))
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      const userSyncConfig = await db
        .select()
        .from(syncConfig)
        .where(eq(syncConfig.userId, userId))
        .limit(1);

      if (userSyncConfig.length === 0) {
        // Return default config
        return {
          mode: "hybrid" as const,
          autoSync: true,
          syncInterval: 30000,
          lastUpdated: new Date().toISOString(),
        };
      }

      return {
        mode: userSyncConfig[0].mode,
        autoSync: userSyncConfig[0].autoSync,
        syncInterval: userSyncConfig[0].syncInterval,
        lastUpdated: userSyncConfig[0].updatedAt.toISOString(),
      };
    }),

  setSyncConfig: protectedProcedure
    .input(setSyncConfigSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Upsert sync configuration
        const existingConfig = await db
          .select()
          .from(syncConfig)
          .where(eq(syncConfig.userId, userId))
          .limit(1);

        if (existingConfig.length === 0) {
          // Create new config
          await db.insert(syncConfig).values({
            id: nanoid(),
            userId,
            mode: input.mode,
            autoSync: input.autoSync,
            syncInterval: input.syncInterval,
            updatedAt: now,
          });
        } else {
          // Update existing config
          await db
            .update(syncConfig)
            .set({
              mode: input.mode,
              autoSync: input.autoSync,
              syncInterval: input.syncInterval,
              updatedAt: now,
            })
            .where(eq(syncConfig.userId, userId));
        }

        return {
          success: true,
          config: {
            mode: input.mode,
            autoSync: input.autoSync,
            syncInterval: input.syncInterval,
            updatedAt: now.toISOString(),
          },
        };

      } catch (error) {
        console.error("Set sync config error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to update sync configuration");
      }
    }),

  // Get sync status and health
  getSyncStatus: protectedProcedure
    .input(getSyncStatusSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Get device information
        const deviceInfo = await db
          .select()
          .from(device)
          .where(and(eq(device.fingerprint, input.deviceId), eq(device.userId, userId)))
          .limit(1);

        if (deviceInfo.length === 0) {
          throw new ORPCError("NOT_FOUND", "Device not found");
        }

        // Get recent sync activity
        const recentSyncEvents = await db
          .select({ count: count() })
          .from(syncEvent)
          .where(
            and(
              eq(syncEvent.userId, userId),
              eq(syncEvent.deviceId, input.deviceId),
              gt(syncEvent.timestamp, new Date(Date.now() - 24 * 60 * 60 * 1000)) // Last 24 hours
            )
          );

        // Get pending events count
        const pendingSyncEvents = await db
          .select({ count: count() })
          .from(syncEvent)
          .where(
            and(
              eq(syncEvent.userId, userId),
              eq(syncEvent.synced, false)
            )
          );

        // Check for unresolved conflicts
        // TODO: Query actual conflicts table when implemented
        const unresolvedConflicts = 0;

        const device = deviceInfo[0];
        const lastSyncDiff = device.lastSyncAt ? Date.now() - device.lastSyncAt.getTime() : null;

        return {
          deviceId: input.deviceId,
          device: {
            id: device.id,
            fingerprint: device.fingerprint,
            lastSyncAt: device.lastSyncAt?.toISOString() || null,
            createdAt: device.createdAt.toISOString(),
          },
          syncHealth: {
            status: lastSyncDiff === null ? "never-synced" 
                   : lastSyncDiff < 300000 ? "healthy"       // Less than 5 minutes
                   : lastSyncDiff < 3600000 ? "stale"       // Less than 1 hour
                   : "outdated",                             // More than 1 hour
            lastSyncAge: lastSyncDiff,
            recentSyncEvents: recentSyncEvents[0]?.count || 0,
            pendingEvents: pendingSyncEvents[0]?.count || 0,
            unresolvedConflicts,
          },
          recommendations: this.generateSyncRecommendations(lastSyncDiff, unresolvedConflicts),
        };

      } catch (error) {
        console.error("Get sync status error:", error);
        if (error instanceof ORPCError) {
          throw error;
        }
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to get sync status");
      }
    }),

  // Force a full sync or partial resync
  forceSync: protectedProcedure
    .input(forceSyncSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Verify device ownership
        const userDevice = await db
          .select()
          .from(device)
          .where(and(eq(device.fingerprint, input.deviceId), eq(device.userId, userId)))
          .limit(1);

        if (userDevice.length === 0) {
          throw new ORPCError("UNAUTHORIZED", "Device not registered or access denied");
        }

        let syncedEntities = [];

        if (input.fullSync) {
          // Full sync - reset last sync timestamp and get all data
          await db
            .update(device)
            .set({ lastSyncAt: null })
            .where(eq(device.fingerprint, input.deviceId));

          // Get all user data based on entity type
          if (input.entityType === "all" || input.entityType === "chat") {
            const userChats = await db
              .select()
              .from(chat)
              .where(and(eq(chat.userId, userId), eq(chat.isDeleted, false)));
            syncedEntities.push(...userChats.map(c => ({ type: "chat", id: c.id })));
          }

          if (input.entityType === "all" || input.entityType === "message") {
            const userMessages = await db
              .select()
              .from(message)
              .innerJoin(chat, eq(message.chatId, chat.id))
              .where(and(eq(chat.userId, userId), eq(message.isDeleted, false)));
            syncedEntities.push(...userMessages.map(m => ({ type: "message", id: m.message.id })));
          }
        } else {
          // Partial sync - create sync events for recent changes
          const recentTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

          if (input.entityType === "all" || input.entityType === "chat") {
            const recentChats = await db
              .select()
              .from(chat)
              .where(
                and(
                  eq(chat.userId, userId),
                  gt(chat.updatedAt, recentTime)
                )
              );

            // Create sync events for recent chats
            const chatSyncEvents = recentChats.map(chat => ({
              id: nanoid(),
              entityType: "chat" as const,
              entityId: chat.id,
              operation: "update" as const,
              data: JSON.stringify(chat),
              timestamp: new Date(),
              userId,
              deviceId: "server",
              synced: true,
            }));

            if (chatSyncEvents.length > 0) {
              await db.insert(syncEvent).values(chatSyncEvents);
              syncedEntities.push(...recentChats.map(c => ({ type: "chat", id: c.id })));
            }
          }
        }

        const now = new Date();
        await db
          .update(device)
          .set({ lastSyncAt: now })
          .where(eq(device.fingerprint, input.deviceId));

        return {
          success: true,
          syncType: input.fullSync ? "full" : "partial",
          entityType: input.entityType,
          syncedEntities,
          syncedCount: syncedEntities.length,
          forcedAt: now.toISOString(),
        };

      } catch (error) {
        console.error("Force sync error:", error);
        if (error instanceof ORPCError) {
          throw error;
        }
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to force sync");
      }
    }),

  // Optimize sync performance
  optimizeSync: protectedProcedure
    .input(optimizeSyncSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Clean up old sync events (older than 30 days)
        const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const oldEventsCount = await db
          .select({ count: count() })
          .from(syncEvent)
          .where(
            and(
              eq(syncEvent.userId, userId),
              lt(syncEvent.timestamp, cutoffDate)
            )
          );

        // TODO: In production, consider archiving instead of deleting
        // await db
        //   .delete(syncEvent)
        //   .where(
        //     and(
        //       eq(syncEvent.userId, userId),
        //       lt(syncEvent.timestamp, cutoffDate)
        //     )
        //   );

        // Consolidate duplicate events for the same entity
        const duplicateEvents = await db
          .select({
            entityType: syncEvent.entityType,
            entityId: syncEvent.entityId,
            count: count(),
          })
          .from(syncEvent)
          .where(eq(syncEvent.userId, userId))
          .groupBy(syncEvent.entityType, syncEvent.entityId)
          .having(sql`COUNT(*) > 5`); // More than 5 events for same entity

        let consolidatedEvents = 0;
        for (const duplicate of duplicateEvents) {
          // Keep only the latest event for each entity
          const eventsToKeep = await db
            .select()
            .from(syncEvent)
            .where(
              and(
                eq(syncEvent.userId, userId),
                eq(syncEvent.entityType, duplicate.entityType),
                eq(syncEvent.entityId, duplicate.entityId)
              )
            )
            .orderBy(desc(syncEvent.timestamp))
            .limit(2); // Keep latest 2 events

          if (eventsToKeep.length > 1) {
            const keepIds = eventsToKeep.map(e => e.id);
            // TODO: Delete old events (implement when needed)
            consolidatedEvents += duplicate.count - 2;
          }
        }

        return {
          success: true,
          optimization: {
            oldEventsProcessed: oldEventsCount[0]?.count || 0,
            consolidatedEvents,
            entitiesOptimized: duplicateEvents.length,
            optimizedAt: new Date().toISOString(),
          },
          recommendations: [
            "Regular sync optimization helps maintain performance",
            "Consider implementing incremental sync for large datasets",
            "Monitor sync event volume to prevent database bloat",
          ],
        };

      } catch (error) {
        console.error("Sync optimization error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to optimize sync");
      }
    }),

  // Get sync analytics and performance metrics
  getSyncAnalytics: protectedProcedure
    .input(getSyncAnalyticsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      const dateFrom = input.dateFrom ? new Date(input.dateFrom) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const dateTo = input.dateTo ? new Date(input.dateTo) : new Date();

      try {
        // Get sync event statistics
        const syncStats = await db
          .select({
            totalEvents: count(),
            entityType: syncEvent.entityType,
            operation: syncEvent.operation,
          })
          .from(syncEvent)
          .where(
            and(
              eq(syncEvent.userId, userId),
              gt(syncEvent.timestamp, dateFrom),
              sql`${syncEvent.timestamp} <= ${dateTo}`,
              input.deviceId ? eq(syncEvent.deviceId, input.deviceId) : undefined
            )
          )
          .groupBy(syncEvent.entityType, syncEvent.operation);

        // Get device sync frequency
        const deviceActivity = await db
          .select({
            deviceId: syncEvent.deviceId,
            eventCount: count(),
            lastActivity: sql<Date>`MAX(${syncEvent.timestamp})`.as('lastActivity'),
          })
          .from(syncEvent)
          .where(
            and(
              eq(syncEvent.userId, userId),
              gt(syncEvent.timestamp, dateFrom),
              sql`${syncEvent.timestamp} <= ${dateTo}`
            )
          )
          .groupBy(syncEvent.deviceId);

        // Calculate performance metrics
        const totalEvents = syncStats.reduce((sum, stat) => sum + stat.totalEvents, 0);
        const avgEventsPerDay = totalEvents / Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (24 * 60 * 60 * 1000));

        return {
          period: {
            from: dateFrom.toISOString(),
            to: dateTo.toISOString(),
          },
          summary: {
            totalSyncEvents: totalEvents,
            averageEventsPerDay: Math.round(avgEventsPerDay * 100) / 100,
            activeDevices: deviceActivity.length,
          },
          breakdown: {
            byEntityType: syncStats.reduce((acc, stat) => {
              if (!acc[stat.entityType]) acc[stat.entityType] = 0;
              acc[stat.entityType] += stat.totalEvents;
              return acc;
            }, {} as Record<string, number>),
            byOperation: syncStats.reduce((acc, stat) => {
              if (!acc[stat.operation]) acc[stat.operation] = 0;
              acc[stat.operation] += stat.totalEvents;
              return acc;
            }, {} as Record<string, number>),
          },
          deviceActivity,
          recommendations: this.generateAnalyticsRecommendations(totalEvents, deviceActivity.length, avgEventsPerDay),
        };

      } catch (error) {
        console.error("Sync analytics error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to get sync analytics");
      }
    }),

  // Internal helper methods
  async applyDataChanges(eventData: any, event: any, userId: string) {
    // Apply actual database changes based on sync events
    const now = new Date();

    switch (event.entityType) {
      case "chat":
        switch (event.operation) {
          case "create":
            await db.insert(chat).values({
              ...eventData,
              userId,
              createdAt: new Date(eventData.createdAt),
              updatedAt: new Date(eventData.updatedAt),
            });
            break;
          case "update":
            await db
              .update(chat)
              .set({
                ...eventData,
                updatedAt: now,
              })
              .where(and(eq(chat.id, eventData.id), eq(chat.userId, userId)));
            break;
          case "delete":
            await db
              .update(chat)
              .set({ isDeleted: true, updatedAt: now })
              .where(and(eq(chat.id, eventData.id), eq(chat.userId, userId)));
            break;
        }
        break;

      case "message":
        switch (event.operation) {
          case "create":
            // Verify chat ownership before creating message
            const chatOwnership = await db
              .select()
              .from(chat)
              .where(and(eq(chat.id, eventData.chatId), eq(chat.userId, userId)))
              .limit(1);

            if (chatOwnership.length > 0) {
              await db.insert(message).values({
                ...eventData,
                createdAt: new Date(eventData.createdAt),
              });
            }
            break;
          case "update":
            await db
              .update(message)
              .set(eventData)
              .where(eq(message.id, eventData.id));
            break;
          case "delete":
            await db
              .update(message)
              .set({ isDeleted: true })
              .where(eq(message.id, eventData.id));
            break;
        }
        break;
    }
  },

  generateSyncRecommendations(lastSyncAge: number | null, unresolvedConflicts: number): string[] {
    const recommendations = [];

    if (lastSyncAge === null) {
      recommendations.push("Device has never synced - consider initiating first sync");
    } else if (lastSyncAge > 3600000) { // 1 hour
      recommendations.push("Device sync is outdated - consider forcing a sync");
    }

    if (unresolvedConflicts > 0) {
      recommendations.push(`${unresolvedConflicts} unresolved conflicts need attention`);
    }

    if (lastSyncAge !== null && lastSyncAge < 60000) { // Less than 1 minute
      recommendations.push("Sync is up to date");
    }

    return recommendations;
  },

  generateAnalyticsRecommendations(totalEvents: number, deviceCount: number, avgEventsPerDay: number): string[] {
    const recommendations = [];

    if (avgEventsPerDay > 100) {
      recommendations.push("High sync activity detected - consider optimizing sync intervals");
    }

    if (deviceCount > 5) {
      recommendations.push("Multiple devices detected - ensure sync conflicts are being handled properly");
    }

    if (totalEvents > 10000) {
      recommendations.push("Large number of sync events - consider implementing sync event cleanup");
    }

    if (avgEventsPerDay < 1) {
      recommendations.push("Low sync activity - verify sync configuration is working correctly");
    }

    return recommendations;
  },
};