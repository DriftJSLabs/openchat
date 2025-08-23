import { protectedProcedure } from "../lib/orpc";
import { db, chat, message, syncEvent, device, chatAnalytics, userPreferences } from "../db";
import { eq, and, gt, desc, like, or, inArray, sql, count, avg, max, min, sum } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { ORPCError } from "@orpc/server";
import { commonRateLimits } from "../middleware/rate-limit";
import { ErrorFactory, ErrorLogger, safeAsync, validateRequired } from "../lib/error-handler";

const createChatSchema = z.object({
  title: z.string().min(1),
});

const updateChatSchema = z.object({
  id: z.string(),
  title: z.string().min(1).optional(),
  isDeleted: z.boolean().optional(),
});

const createMessageSchema = z.object({
  chatId: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
});

const syncRequestSchema = z.object({
  lastSyncTimestamp: z.number().optional(),
  deviceId: z.string(),
});

// Additional schemas for enhanced operations
const updateMessageSchema = z.object({
  id: z.string(),
  content: z.string().min(1).optional(),
  role: z.enum(["user", "assistant", "system"]).optional(),
});

const searchChatsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0),
});

const getChatMetadataSchema = z.object({
  id: z.string(),
});

const bulkDeleteChatsSchema = z.object({
  chatIds: z.array(z.string()).min(1).max(50), // Limit bulk operations to prevent abuse
});

const exportChatSchema = z.object({
  id: z.string(),
  format: z.enum(["json", "markdown", "plain"]).default("json"),
});

const bulkOperationSchema = z.object({
  operation: z.enum(["archive", "unarchive", "delete"]),
  chatIds: z.array(z.string()).min(1).max(50),
});

const getChatAnalyticsSchema = z.object({
  dateFrom: z.string().optional(), // ISO date string
  dateTo: z.string().optional(),
  groupBy: z.enum(["day", "week", "month"]).default("day"),
});

// Additional enhanced schemas
const archiveChatSchema = z.object({
  id: z.string(),
  isArchived: z.boolean(),
});

const pinChatSchema = z.object({
  id: z.string(),
  isPinned: z.boolean(),
});

const addTagsSchema = z.object({
  id: z.string(),
  tags: z.array(z.string()).min(1).max(10),
});

const removeTagsSchema = z.object({
  id: z.string(),
  tags: z.array(z.string()).min(1),
});

const getChatsWithFiltersSchema = z.object({
  isArchived: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  chatType: z.enum(["conversation", "assistant", "group", "system"]).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(["updatedAt", "createdAt", "title", "messageCount"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const duplicateChatSchema = z.object({
  id: z.string(),
  newTitle: z.string().min(1).optional(),
});

const getMessagesByDateRangeSchema = z.object({
  chatId: z.string(),
  dateFrom: z.string(), // ISO date string
  dateTo: z.string(), // ISO date string
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const createMessageWithMetadataSchema = z.object({
  chatId: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
  messageType: z.enum(["text", "image", "file", "code", "system"]).default("text"),
  metadata: z.record(z.any()).optional(),
  parentMessageId: z.string().optional(),
  tokenCount: z.number().min(0).optional(),
});

const getMessageThreadSchema = z.object({
  messageId: z.string(),
  depth: z.number().min(1).max(10).default(5),
});

export const chatRouter = {
  // Get user's chats
  getChats: protectedProcedure
    .input(syncRequestSchema.optional())
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const lastSync = input?.lastSyncTimestamp || 0;

      const userChats = await db
        .select()
        .from(chat)
        .where(
          and(
            eq(chat.userId, userId),
            eq(chat.isDeleted, false),
            gt(chat.updatedAt, new Date(lastSync * 1000))
          )
        )
        .orderBy(desc(chat.updatedAt));

      return userChats;
    }),

  // Create a new chat
  createChat: protectedProcedure
    .input(createChatSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      const newChat = {
        id: nanoid(),
        title: input.title,
        userId,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      };

      await db.insert(chat).values(newChat);

      // Create sync event
      await db.insert(syncEvent).values({
        id: nanoid(),
        entityType: "chat",
        entityId: newChat.id,
        operation: "create",
        data: JSON.stringify(newChat),
        timestamp: now,
        userId,
        deviceId: "server",
        synced: true,
      });

      return newChat;
    }),

  // Update a chat
  updateChat: protectedProcedure
    .input(updateChatSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      const updates: any = {
        updatedAt: now,
      };

      if (input.title !== undefined) updates.title = input.title;
      if (input.isDeleted !== undefined) updates.isDeleted = input.isDeleted;

      await db
        .update(chat)
        .set(updates)
        .where(and(eq(chat.id, input.id), eq(chat.userId, userId)));

      // Create sync event
      await db.insert(syncEvent).values({
        id: nanoid(),
        entityType: "chat",
        entityId: input.id,
        operation: "update",
        data: JSON.stringify({ id: input.id, ...updates }),
        timestamp: now,
        userId,
        deviceId: "server",
        synced: true,
      });

      return { success: true };
    }),

  // Delete a chat
  deleteChat: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      await db
        .update(chat)
        .set({ isDeleted: true, updatedAt: now })
        .where(and(eq(chat.id, input.id), eq(chat.userId, userId)));

      // Also soft delete associated messages
      await db
        .update(message)
        .set({ isDeleted: true })
        .where(eq(message.chatId, input.id));

      // Create sync event
      await db.insert(syncEvent).values({
        id: nanoid(),
        entityType: "chat",
        entityId: input.id,
        operation: "delete",
        data: JSON.stringify({ id: input.id }),
        timestamp: now,
        userId,
        deviceId: "server",
        synced: true,
      });

      return { success: true };
    }),

  // Get messages for a chat
  getMessages: protectedProcedure
    .input(
      z.object({
        chatId: z.string(),
        lastSyncTimestamp: z.number().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const lastSync = input.lastSyncTimestamp || 0;

      // Verify user owns the chat
      const chatExists = await db
        .select()
        .from(chat)
        .where(and(eq(chat.id, input.chatId), eq(chat.userId, userId)))
        .limit(1);

      if (chatExists.length === 0) {
        throw new Error("Chat not found or access denied");
      }

      const chatMessages = await db
        .select()
        .from(message)
        .where(
          and(
            eq(message.chatId, input.chatId),
            eq(message.isDeleted, false),
            gt(message.createdAt, new Date(lastSync * 1000))
          )
        )
        .orderBy(message.createdAt);

      return chatMessages;
    }),

  // Create a new message
  createMessage: protectedProcedure
    .input(createMessageSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      // Verify user owns the chat
      const chatExists = await db
        .select()
        .from(chat)
        .where(and(eq(chat.id, input.chatId), eq(chat.userId, userId)))
        .limit(1);

      if (chatExists.length === 0) {
        throw new Error("Chat not found or access denied");
      }

      const newMessage = {
        id: nanoid(),
        chatId: input.chatId,
        role: input.role,
        content: input.content,
        createdAt: now,
        isDeleted: false,
      };

      await db.insert(message).values(newMessage);

      // Create sync event
      await db.insert(syncEvent).values({
        id: nanoid(),
        entityType: "message",
        entityId: newMessage.id,
        operation: "create",
        data: JSON.stringify(newMessage),
        timestamp: now,
        userId,
        deviceId: "server",
        synced: true,
      });

      return newMessage;
    }),

  // Delete a message
  deleteMessage: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      // Verify user owns the message (through chat ownership)
      const messageWithChat = await db
        .select({
          messageId: message.id,
          chatUserId: chat.userId,
        })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(eq(message.id, input.id))
        .limit(1);

      if (messageWithChat.length === 0 || messageWithChat[0].chatUserId !== userId) {
        throw new Error("Message not found or access denied");
      }

      const now = new Date();
      await db
        .update(message)
        .set({ isDeleted: true })
        .where(eq(message.id, input.id));

      // Create sync event
      await db.insert(syncEvent).values({
        id: nanoid(),
        entityType: "message",
        entityId: input.id,
        operation: "delete",
        data: JSON.stringify({ id: input.id }),
        timestamp: now,
        userId,
        deviceId: "server",
        synced: true,
      });

      return { success: true };
    }),

  // Get sync events (for pulling changes from server)
  getSyncEvents: protectedProcedure
    .input(syncRequestSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const lastSync = input.lastSyncTimestamp || 0;

      const events = await db
        .select()
        .from(syncEvent)
        .where(
          and(
            eq(syncEvent.userId, userId),
            gt(syncEvent.timestamp, new Date(lastSync * 1000))
          )
        )
        .orderBy(syncEvent.timestamp);

      return events;
    }),

  // Register/update device for sync
  registerDevice: protectedProcedure
    .input(
      z.object({
        fingerprint: z.string(),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Try to insert new device
        const newDevice = {
          id: nanoid(),
          userId,
          fingerprint: input.fingerprint,
          lastSyncAt: null,
          createdAt: now,
        };

        await db.insert(device).values(newDevice);
        return newDevice;
      } catch (error) {
        // Device already exists, update it
        await db
          .update(device)
          .set({ userId, createdAt: now })
          .where(eq(device.fingerprint, input.fingerprint));

        const existingDevice = await db
          .select()
          .from(device)
          .where(eq(device.fingerprint, input.fingerprint))
          .limit(1);

        return existingDevice[0];
      }
    }),

  // Update last sync timestamp
  updateLastSync: protectedProcedure
    .input(
      z.object({
        deviceId: z.string(),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      await db
        .update(device)
        .set({ lastSyncAt: now })
        .where(and(eq(device.fingerprint, input.deviceId), eq(device.userId, userId)));

      return { success: true };
    }),

  // Update a message
  updateMessage: protectedProcedure
    .input(updateMessageSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      // Verify user owns the message (through chat ownership)
      const messageWithChat = await db
        .select({
          messageId: message.id,
          chatUserId: chat.userId,
          chatId: message.chatId,
        })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(and(eq(message.id, input.id), eq(message.isDeleted, false)))
        .limit(1);

      if (messageWithChat.length === 0 || messageWithChat[0].chatUserId !== userId) {
        throw new Error("Message not found or access denied");
      }

      const updates: any = {};
      if (input.content !== undefined) updates.content = input.content;
      if (input.role !== undefined) updates.role = input.role;

      if (Object.keys(updates).length === 0) {
        throw new Error("No updates provided");
      }

      await db
        .update(message)
        .set(updates)
        .where(eq(message.id, input.id));

      const now = new Date();
      // Create sync event
      await db.insert(syncEvent).values({
        id: nanoid(),
        entityType: "message",
        entityId: input.id,
        operation: "update",
        data: JSON.stringify({ id: input.id, ...updates }),
        timestamp: now,
        userId,
        deviceId: "server",
        synced: true,
      });

      return { success: true, ...updates };
    }),

  // Search chats by title and content
  searchChats: protectedProcedure
    .input(searchChatsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const searchTerm = `%${input.query}%`;

      // Search in chat titles and message content
      const chatsFromTitles = await db
        .select({
          id: chat.id,
          title: chat.title,
          userId: chat.userId,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          isDeleted: chat.isDeleted,
          matchType: sql<string>`'title'`.as('matchType'),
        })
        .from(chat)
        .where(
          and(
            eq(chat.userId, userId),
            eq(chat.isDeleted, false),
            like(chat.title, searchTerm)
          )
        );

      const chatsFromMessages = await db
        .selectDistinct({
          id: chat.id,
          title: chat.title,
          userId: chat.userId,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          isDeleted: chat.isDeleted,
          matchType: sql<string>`'content'`.as('matchType'),
        })
        .from(chat)
        .innerJoin(message, eq(message.chatId, chat.id))
        .where(
          and(
            eq(chat.userId, userId),
            eq(chat.isDeleted, false),
            eq(message.isDeleted, false),
            like(message.content, searchTerm)
          )
        );

      // Combine and deduplicate results
      const allChats = [...chatsFromTitles, ...chatsFromMessages];
      const uniqueChats = allChats.reduce((acc, chat) => {
        if (!acc.find(c => c.id === chat.id)) {
          acc.push(chat);
        }
        return acc;
      }, [] as typeof allChats);

      // Sort by updated date and apply pagination
      const sortedChats = uniqueChats
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(input.offset, input.offset + input.limit);

      return {
        chats: sortedChats,
        total: uniqueChats.length,
        hasMore: input.offset + input.limit < uniqueChats.length,
      };
    }),

  // Get chat metadata including message count and last activity
  getChatMetadata: protectedProcedure
    .input(getChatMetadataSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      // Verify user owns the chat
      const chatData = await db
        .select()
        .from(chat)
        .where(and(eq(chat.id, input.id), eq(chat.userId, userId)))
        .limit(1);

      if (chatData.length === 0) {
        throw new Error("Chat not found or access denied");
      }

      // Get message count and last message
      const messageStats = await db
        .select({
          count: count(),
          lastMessageDate: sql<Date>`MAX(${message.createdAt})`.as('lastMessageDate'),
        })
        .from(message)
        .where(and(eq(message.chatId, input.id), eq(message.isDeleted, false)));

      const lastMessage = await db
        .select()
        .from(message)
        .where(and(eq(message.chatId, input.id), eq(message.isDeleted, false)))
        .orderBy(desc(message.createdAt))
        .limit(1);

      return {
        chat: chatData[0],
        messageCount: messageStats[0]?.count || 0,
        lastActivity: messageStats[0]?.lastMessageDate || chatData[0].updatedAt,
        lastMessage: lastMessage[0] || null,
      };
    }),

  // Bulk delete chats
  bulkDeleteChats: protectedProcedure
    .input(bulkDeleteChatsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      // Verify user owns all chats
      const userChats = await db
        .select({ id: chat.id })
        .from(chat)
        .where(and(inArray(chat.id, input.chatIds), eq(chat.userId, userId)));

      const validChatIds = userChats.map(c => c.id);
      const invalidChatIds = input.chatIds.filter(id => !validChatIds.includes(id));

      if (invalidChatIds.length > 0) {
        throw new Error(`Access denied or chats not found: ${invalidChatIds.join(', ')}`);
      }

      // Soft delete chats
      await db
        .update(chat)
        .set({ isDeleted: true, updatedAt: now })
        .where(inArray(chat.id, validChatIds));

      // Soft delete associated messages
      await db
        .update(message)
        .set({ isDeleted: true })
        .where(inArray(message.chatId, validChatIds));

      // Create sync events for each chat
      const syncEvents = validChatIds.map(chatId => ({
        id: nanoid(),
        entityType: "chat" as const,
        entityId: chatId,
        operation: "delete" as const,
        data: JSON.stringify({ id: chatId }),
        timestamp: now,
        userId,
        deviceId: "server",
        synced: true,
      }));

      await db.insert(syncEvent).values(syncEvents);

      return {
        success: true,
        deletedCount: validChatIds.length,
        deletedChatIds: validChatIds,
      };
    }),

  // Export chat data in various formats
  exportChat: protectedProcedure
    .input(exportChatSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      // Verify user owns the chat
      const chatData = await db
        .select()
        .from(chat)
        .where(and(eq(chat.id, input.id), eq(chat.userId, userId)))
        .limit(1);

      if (chatData.length === 0) {
        throw new Error("Chat not found or access denied");
      }

      // Get all messages for the chat
      const messages = await db
        .select()
        .from(message)
        .where(and(eq(message.chatId, input.id), eq(message.isDeleted, false)))
        .orderBy(message.createdAt);

      const exportData = {
        chat: chatData[0],
        messages,
        exportedAt: new Date().toISOString(),
        format: input.format,
      };

      switch (input.format) {
        case "json":
          return {
            format: "json",
            data: JSON.stringify(exportData, null, 2),
            filename: `chat-${input.id}-${Date.now()}.json`,
          };

        case "markdown":
          let markdown = `# ${chatData[0].title}\n\n`;
          markdown += `**Created:** ${chatData[0].createdAt.toISOString()}\n`;
          markdown += `**Messages:** ${messages.length}\n\n`;
          markdown += "---\n\n";

          for (const msg of messages) {
            markdown += `**${msg.role.toUpperCase()}** (${msg.createdAt.toISOString()})\n\n`;
            markdown += `${msg.content}\n\n`;
            markdown += "---\n\n";
          }

          return {
            format: "markdown",
            data: markdown,
            filename: `chat-${input.id}-${Date.now()}.md`,
          };

        case "plain":
          let plainText = `${chatData[0].title}\n`;
          plainText += `Created: ${chatData[0].createdAt.toISOString()}\n`;
          plainText += `Messages: ${messages.length}\n\n`;
          plainText += "=" + "=".repeat(50) + "\n\n";

          for (const msg of messages) {
            plainText += `[${msg.role.toUpperCase()}] ${msg.createdAt.toISOString()}\n`;
            plainText += `${msg.content}\n\n`;
            plainText += "-".repeat(50) + "\n\n";
          }

          return {
            format: "plain",
            data: plainText,
            filename: `chat-${input.id}-${Date.now()}.txt`,
          };

        default:
          throw new Error("Unsupported export format");
      }
    }),

  // Bulk operations on chats (archive, unarchive, delete)
  bulkOperations: protectedProcedure
    .input(bulkOperationSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      // Verify user owns all chats
      const userChats = await db
        .select({ id: chat.id })
        .from(chat)
        .where(and(inArray(chat.id, input.chatIds), eq(chat.userId, userId)));

      const validChatIds = userChats.map(c => c.id);
      const invalidChatIds = input.chatIds.filter(id => !validChatIds.includes(id));

      if (invalidChatIds.length > 0) {
        throw new Error(`Access denied or chats not found: ${invalidChatIds.join(', ')}`);
      }

      let updates: any = { updatedAt: now };
      let operation: string;

      switch (input.operation) {
        case "delete":
          updates.isDeleted = true;
          operation = "delete";
          // Also soft delete associated messages
          await db
            .update(message)
            .set({ isDeleted: true })
            .where(inArray(message.chatId, validChatIds));
          break;
        case "archive":
          updates.isArchived = true;
          operation = "update";
          break;
        case "unarchive":
          updates.isArchived = false;
          operation = "update";
          break;
        default:
          throw new Error("Invalid bulk operation");
      }

      // Apply updates to chats
      await db
        .update(chat)
        .set(updates)
        .where(inArray(chat.id, validChatIds));

      // Create sync events for each chat
      const syncEvents = validChatIds.map(chatId => ({
        id: nanoid(),
        entityType: "chat" as const,
        entityId: chatId,
        operation: operation as any,
        data: JSON.stringify({ id: chatId, ...updates }),
        timestamp: now,
        userId,
        deviceId: "server",
        synced: true,
      }));

      await db.insert(syncEvent).values(syncEvents);

      return {
        success: true,
        processedCount: validChatIds.length,
        processedChatIds: validChatIds,
        operation: input.operation,
      };
    }),

  // Get chat analytics and usage statistics
  getChatAnalytics: protectedProcedure
    .input(getChatAnalyticsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      // Parse date filters
      const dateFrom = input.dateFrom ? new Date(input.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const dateTo = input.dateTo ? new Date(input.dateTo) : new Date();

      // Get total chats count
      const totalChats = await db
        .select({ count: count() })
        .from(chat)
        .where(and(eq(chat.userId, userId), eq(chat.isDeleted, false)));

      // Get total messages count
      const totalMessages = await db
        .select({ count: count() })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(
          and(
            eq(chat.userId, userId),
            eq(chat.isDeleted, false),
            eq(message.isDeleted, false)
          )
        );

      // Get chats created in date range
      const chatsInRange = await db
        .select({ count: count() })
        .from(chat)
        .where(
          and(
            eq(chat.userId, userId),
            eq(chat.isDeleted, false),
            gt(chat.createdAt, dateFrom),
            sql`${chat.createdAt} <= ${dateTo}`
          )
        );

      // Get messages created in date range
      const messagesInRange = await db
        .select({ count: count() })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(
          and(
            eq(chat.userId, userId),
            eq(chat.isDeleted, false),
            eq(message.isDeleted, false),
            gt(message.createdAt, dateFrom),
            sql`${message.createdAt} <= ${dateTo}`
          )
        );

      // Get most active chats (by message count)
      const mostActiveChats = await db
        .select({
          chatId: chat.id,
          title: chat.title,
          messageCount: count(),
        })
        .from(chat)
        .innerJoin(message, eq(message.chatId, chat.id))
        .where(
          and(
            eq(chat.userId, userId),
            eq(chat.isDeleted, false),
            eq(message.isDeleted, false)
          )
        )
        .groupBy(chat.id, chat.title)
        .orderBy(desc(count()))
        .limit(10);

      return {
        summary: {
          totalChats: totalChats[0]?.count || 0,
          totalMessages: totalMessages[0]?.count || 0,
          chatsInDateRange: chatsInRange[0]?.count || 0,
          messagesInDateRange: messagesInRange[0]?.count || 0,
          dateRange: {
            from: dateFrom.toISOString(),
            to: dateTo.toISOString(),
          },
        },
        mostActiveChats,
        generatedAt: new Date().toISOString(),
      };
    }),

  // Archive or unarchive a chat
  archiveChat: protectedProcedure
    .use(commonRateLimits.api)
    .input(archiveChatSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Verify user owns the chat
        const existingChat = await db
          .select({ id: chat.id, isArchived: chat.isArchived })
          .from(chat)
          .where(and(eq(chat.id, input.id), eq(chat.userId, userId), eq(chat.isDeleted, false)))
          .limit(1);

        if (existingChat.length === 0) {
          throw ErrorFactory.resourceNotFound("Chat", input.id, context).toORPCError();
        }

        // Check if already in desired state
        if (existingChat[0].isArchived === input.isArchived) {
          return {
            success: true,
            message: `Chat is already ${input.isArchived ? 'archived' : 'unarchived'}`,
            wasAlreadyInState: true,
          };
        }

        // Update chat archive status
        await db
          .update(chat)
          .set({ 
            isArchived: input.isArchived, 
            updatedAt: now 
          })
          .where(eq(chat.id, input.id));

        // Create sync event
        await db.insert(syncEvent).values({
          id: nanoid(),
          entityType: "chat",
          entityId: input.id,
          operation: "update",
          data: JSON.stringify({ 
            id: input.id, 
            isArchived: input.isArchived, 
            updatedAt: now 
          }),
          timestamp: now,
          userId,
          deviceId: "server",
          synced: true,
        });

        return {
          success: true,
          message: `Chat ${input.isArchived ? 'archived' : 'unarchived'} successfully`,
          wasAlreadyInState: false,
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        console.error("Archive chat error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to update chat archive status");
      }
    }),

  // Pin or unpin a chat
  pinChat: protectedProcedure
    .use(commonRateLimits.api)
    .input(pinChatSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Verify user owns the chat
        const existingChat = await db
          .select({ id: chat.id, isPinned: chat.isPinned })
          .from(chat)
          .where(and(eq(chat.id, input.id), eq(chat.userId, userId), eq(chat.isDeleted, false)))
          .limit(1);

        if (existingChat.length === 0) {
          throw ErrorFactory.resourceNotFound("Chat", input.id, context).toORPCError();
        }

        // Check if already in desired state
        if (existingChat[0].isPinned === input.isPinned) {
          return {
            success: true,
            message: `Chat is already ${input.isPinned ? 'pinned' : 'unpinned'}`,
            wasAlreadyInState: true,
          };
        }

        // Update chat pin status
        await db
          .update(chat)
          .set({ 
            isPinned: input.isPinned, 
            updatedAt: now 
          })
          .where(eq(chat.id, input.id));

        // Create sync event
        await db.insert(syncEvent).values({
          id: nanoid(),
          entityType: "chat",
          entityId: input.id,
          operation: "update",
          data: JSON.stringify({ 
            id: input.id, 
            isPinned: input.isPinned, 
            updatedAt: now 
          }),
          timestamp: now,
          userId,
          deviceId: "server",
          synced: true,
        });

        return {
          success: true,
          message: `Chat ${input.isPinned ? 'pinned' : 'unpinned'} successfully`,
          wasAlreadyInState: false,
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        console.error("Pin chat error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to update chat pin status");
      }
    }),

  // Add tags to a chat
  addTags: protectedProcedure
    .use(commonRateLimits.api)
    .input(addTagsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Verify user owns the chat and get existing tags
        const existingChat = await db
          .select({ id: chat.id, tags: chat.tags })
          .from(chat)
          .where(and(eq(chat.id, input.id), eq(chat.userId, userId), eq(chat.isDeleted, false)))
          .limit(1);

        if (existingChat.length === 0) {
          throw ErrorFactory.resourceNotFound("Chat", input.id, context).toORPCError();
        }

        // Parse existing tags and merge with new ones
        const existingTags = existingChat[0].tags ? JSON.parse(existingChat[0].tags) : [];
        const newTags = [...new Set([...existingTags, ...input.tags])]; // Remove duplicates

        // Validate tag count limit
        if (newTags.length > 10) {
          throw new ORPCError("BAD_REQUEST", "Maximum 10 tags allowed per chat");
        }

        // Update chat with new tags
        await db
          .update(chat)
          .set({ 
            tags: JSON.stringify(newTags), 
            updatedAt: now 
          })
          .where(eq(chat.id, input.id));

        // Create sync event
        await db.insert(syncEvent).values({
          id: nanoid(),
          entityType: "chat",
          entityId: input.id,
          operation: "update",
          data: JSON.stringify({ 
            id: input.id, 
            tags: JSON.stringify(newTags), 
            updatedAt: now 
          }),
          timestamp: now,
          userId,
          deviceId: "server",
          synced: true,
        });

        return {
          success: true,
          addedTags: input.tags.filter(tag => !existingTags.includes(tag)),
          currentTags: newTags,
          totalTags: newTags.length,
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        console.error("Add tags error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to add tags to chat");
      }
    }),

  // Remove tags from a chat
  removeTags: protectedProcedure
    .use(commonRateLimits.api)
    .input(removeTagsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Verify user owns the chat and get existing tags
        const existingChat = await db
          .select({ id: chat.id, tags: chat.tags })
          .from(chat)
          .where(and(eq(chat.id, input.id), eq(chat.userId, userId), eq(chat.isDeleted, false)))
          .limit(1);

        if (existingChat.length === 0) {
          throw ErrorFactory.resourceNotFound("Chat", input.id, context).toORPCError();
        }

        // Parse existing tags and remove specified ones
        const existingTags = existingChat[0].tags ? JSON.parse(existingChat[0].tags) : [];
        const remainingTags = existingTags.filter((tag: string) => !input.tags.includes(tag));

        // Update chat with remaining tags
        await db
          .update(chat)
          .set({ 
            tags: remainingTags.length > 0 ? JSON.stringify(remainingTags) : null, 
            updatedAt: now 
          })
          .where(eq(chat.id, input.id));

        // Create sync event
        await db.insert(syncEvent).values({
          id: nanoid(),
          entityType: "chat",
          entityId: input.id,
          operation: "update",
          data: JSON.stringify({ 
            id: input.id, 
            tags: remainingTags.length > 0 ? JSON.stringify(remainingTags) : null, 
            updatedAt: now 
          }),
          timestamp: now,
          userId,
          deviceId: "server",
          synced: true,
        });

        return {
          success: true,
          removedTags: input.tags.filter(tag => existingTags.includes(tag)),
          currentTags: remainingTags,
          totalTags: remainingTags.length,
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        console.error("Remove tags error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to remove tags from chat");
      }
    }),

  // Get chats with advanced filtering and sorting
  getChatsWithFilters: protectedProcedure
    .use(commonRateLimits.api)
    .input(getChatsWithFiltersSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Build dynamic where conditions
        const conditions = [eq(chat.userId, userId), eq(chat.isDeleted, false)];
        
        if (input.isArchived !== undefined) {
          conditions.push(eq(chat.isArchived, input.isArchived));
        }
        
        if (input.isPinned !== undefined) {
          conditions.push(eq(chat.isPinned, input.isPinned));
        }
        
        if (input.chatType !== undefined) {
          conditions.push(eq(chat.chatType, input.chatType));
        }
        
        // Handle tag filtering (this requires a more complex query for JSON arrays)
        let chatsQuery = db
          .select({
            id: chat.id,
            title: chat.title,
            userId: chat.userId,
            chatType: chat.chatType,
            settings: chat.settings,
            tags: chat.tags,
            isPinned: chat.isPinned,
            isArchived: chat.isArchived,
            lastActivityAt: chat.lastActivityAt,
            messageCount: chat.messageCount,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            isDeleted: chat.isDeleted,
          })
          .from(chat)
          .where(and(...conditions));

        // Apply sorting
        switch (input.sortBy) {
          case "createdAt":
            chatsQuery = input.sortOrder === "asc" 
              ? chatsQuery.orderBy(chat.createdAt)
              : chatsQuery.orderBy(desc(chat.createdAt));
            break;
          case "title":
            chatsQuery = input.sortOrder === "asc" 
              ? chatsQuery.orderBy(chat.title)
              : chatsQuery.orderBy(desc(chat.title));
            break;
          case "messageCount":
            chatsQuery = input.sortOrder === "asc" 
              ? chatsQuery.orderBy(chat.messageCount)
              : chatsQuery.orderBy(desc(chat.messageCount));
            break;
          default: // updatedAt
            chatsQuery = input.sortOrder === "asc" 
              ? chatsQuery.orderBy(chat.updatedAt)
              : chatsQuery.orderBy(desc(chat.updatedAt));
        }

        // Apply pagination
        const chats = await chatsQuery
          .limit(input.limit)
          .offset(input.offset);

        // Filter by tags if specified (post-query filtering for JSON arrays)
        let filteredChats = chats;
        if (input.tags && input.tags.length > 0) {
          filteredChats = chats.filter(chat => {
            if (!chat.tags) return false;
            const chatTags = JSON.parse(chat.tags);
            return input.tags!.some(tag => chatTags.includes(tag));
          });
        }

        // Get total count for pagination info
        const totalCountQuery = await db
          .select({ count: count() })
          .from(chat)
          .where(and(...conditions));

        let totalCount = totalCountQuery[0]?.count || 0;
        
        // Adjust total count if tag filtering was applied
        if (input.tags && input.tags.length > 0) {
          const allChats = await db
            .select({ tags: chat.tags })
            .from(chat)
            .where(and(...conditions));
          
          totalCount = allChats.filter(chat => {
            if (!chat.tags) return false;
            const chatTags = JSON.parse(chat.tags);
            return input.tags!.some(tag => chatTags.includes(tag));
          }).length;
        }

        return {
          chats: filteredChats,
          pagination: {
            total: totalCount,
            limit: input.limit,
            offset: input.offset,
            hasMore: input.offset + input.limit < totalCount,
            totalPages: Math.ceil(totalCount / input.limit),
            currentPage: Math.floor(input.offset / input.limit) + 1,
          },
          filters: {
            isArchived: input.isArchived,
            isPinned: input.isPinned,
            tags: input.tags,
            chatType: input.chatType,
            sortBy: input.sortBy,
            sortOrder: input.sortOrder,
          },
        };
      } catch (error) {
        console.error("Get chats with filters error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to retrieve chats with filters");
      }
    }),

  // Duplicate a chat (copy structure but not messages)
  duplicateChat: protectedProcedure
    .use(commonRateLimits.api)
    .input(duplicateChatSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Get the original chat
        const originalChat = await db
          .select()
          .from(chat)
          .where(and(eq(chat.id, input.id), eq(chat.userId, userId), eq(chat.isDeleted, false)))
          .limit(1);

        if (originalChat.length === 0) {
          throw new ORPCError("NOT_FOUND", "Chat not found or access denied");
        }

        const original = originalChat[0];
        
        // Create the new chat with copied settings
        const newChat = {
          id: nanoid(),
          title: input.newTitle || `${original.title} (Copy)`,
          userId,
          chatType: original.chatType,
          settings: original.settings,
          tags: original.tags,
          isPinned: false, // Don't pin the copy by default
          isArchived: false, // Don't archive the copy by default
          lastActivityAt: now,
          messageCount: 0, // Start with no messages
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        };

        await db.insert(chat).values(newChat);

        // Create sync event
        await db.insert(syncEvent).values({
          id: nanoid(),
          entityType: "chat",
          entityId: newChat.id,
          operation: "create",
          data: JSON.stringify(newChat),
          timestamp: now,
          userId,
          deviceId: "server",
          synced: true,
        });

        return {
          success: true,
          originalChatId: input.id,
          newChat,
          message: "Chat duplicated successfully",
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        console.error("Duplicate chat error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to duplicate chat");
      }
    }),

  // Get messages within a specific date range
  getMessagesByDateRange: protectedProcedure
    .use(commonRateLimits.api)
    .input(getMessagesByDateRangeSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Verify user owns the chat
        const chatExists = await db
          .select({ id: chat.id })
          .from(chat)
          .where(and(eq(chat.id, input.chatId), eq(chat.userId, userId), eq(chat.isDeleted, false)))
          .limit(1);

        if (chatExists.length === 0) {
          throw new ORPCError("NOT_FOUND", "Chat not found or access denied");
        }

        // Parse date range
        const dateFrom = new Date(input.dateFrom);
        const dateTo = new Date(input.dateTo);

        if (dateFrom >= dateTo) {
          throw new ORPCError("BAD_REQUEST", "dateFrom must be earlier than dateTo");
        }

        // Get messages in date range
        const messages = await db
          .select()
          .from(message)
          .where(
            and(
              eq(message.chatId, input.chatId),
              eq(message.isDeleted, false),
              gt(message.createdAt, dateFrom),
              sql`${message.createdAt} <= ${dateTo}`
            )
          )
          .orderBy(message.createdAt)
          .limit(input.limit)
          .offset(input.offset);

        // Get total count in date range
        const totalCountQuery = await db
          .select({ count: count() })
          .from(message)
          .where(
            and(
              eq(message.chatId, input.chatId),
              eq(message.isDeleted, false),
              gt(message.createdAt, dateFrom),
              sql`${message.createdAt} <= ${dateTo}`
            )
          );

        const totalCount = totalCountQuery[0]?.count || 0;

        return {
          messages,
          dateRange: {
            from: dateFrom.toISOString(),
            to: dateTo.toISOString(),
          },
          pagination: {
            total: totalCount,
            limit: input.limit,
            offset: input.offset,
            hasMore: input.offset + input.limit < totalCount,
          },
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        console.error("Get messages by date range error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to retrieve messages by date range");
      }
    }),

  // Create a message with enhanced metadata and threading support
  createMessageWithMetadata: protectedProcedure
    .use(commonRateLimits.api)
    .input(createMessageWithMetadataSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Verify user owns the chat
        const chatExists = await db
          .select({ id: chat.id, messageCount: chat.messageCount })
          .from(chat)
          .where(and(eq(chat.id, input.chatId), eq(chat.userId, userId), eq(chat.isDeleted, false)))
          .limit(1);

        if (chatExists.length === 0) {
          throw new ORPCError("NOT_FOUND", "Chat not found or access denied");
        }

        // Verify parent message exists and belongs to the same chat if specified
        if (input.parentMessageId) {
          const parentMessage = await db
            .select({ id: message.id, chatId: message.chatId })
            .from(message)
            .where(and(eq(message.id, input.parentMessageId), eq(message.isDeleted, false)))
            .limit(1);

          if (parentMessage.length === 0) {
            throw new ORPCError("NOT_FOUND", "Parent message not found");
          }

          if (parentMessage[0].chatId !== input.chatId) {
            throw new ORPCError("BAD_REQUEST", "Parent message must belong to the same chat");
          }
        }

        // Create the new message
        const newMessage = {
          id: nanoid(),
          chatId: input.chatId,
          role: input.role,
          content: input.content,
          messageType: input.messageType,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          parentMessageId: input.parentMessageId || null,
          editHistory: null, // Initialize as empty
          tokenCount: input.tokenCount || 0,
          createdAt: now,
          isDeleted: false,
        };

        await db.insert(message).values(newMessage);

        // Update chat message count and last activity
        await db
          .update(chat)
          .set({ 
            messageCount: chatExists[0].messageCount + 1,
            lastActivityAt: now,
            updatedAt: now,
          })
          .where(eq(chat.id, input.chatId));

        // Create sync event
        await db.insert(syncEvent).values({
          id: nanoid(),
          entityType: "message",
          entityId: newMessage.id,
          operation: "create",
          data: JSON.stringify(newMessage),
          timestamp: now,
          userId,
          deviceId: "server",
          synced: true,
        });

        return {
          ...newMessage,
          metadata: input.metadata, // Return parsed metadata
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        console.error("Create message with metadata error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to create message");
      }
    }),

  // Get message thread (parent and child messages)
  getMessageThread: protectedProcedure
    .use(commonRateLimits.api)
    .input(getMessageThreadSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // First, get the target message and verify access
        const targetMessage = await db
          .select({
            messageId: message.id,
            chatId: message.chatId,
            chatUserId: chat.userId,
            role: message.role,
            content: message.content,
            messageType: message.messageType,
            metadata: message.metadata,
            parentMessageId: message.parentMessageId,
            tokenCount: message.tokenCount,
            createdAt: message.createdAt,
          })
          .from(message)
          .innerJoin(chat, eq(message.chatId, chat.id))
          .where(and(eq(message.id, input.messageId), eq(message.isDeleted, false)))
          .limit(1);

        if (targetMessage.length === 0) {
          throw new ORPCError("NOT_FOUND", "Message not found");
        }

        if (targetMessage[0].chatUserId !== userId) {
          throw new ORPCError("FORBIDDEN", "Access denied to this message");
        }

        const target = targetMessage[0];
        const thread: any[] = [target];

        // Get child messages (recursively up to depth limit)
        async function getChildMessages(parentId: string, currentDepth: number): Promise<any[]> {
          if (currentDepth >= input.depth) return [];

          const children = await db
            .select()
            .from(message)
            .where(and(eq(message.parentMessageId, parentId), eq(message.isDeleted, false)))
            .orderBy(message.createdAt);

          const childrenWithSubChildren = [];
          for (const child of children) {
            const subChildren = await getChildMessages(child.id, currentDepth + 1);
            childrenWithSubChildren.push({
              ...child,
              children: subChildren,
              depth: currentDepth + 1,
            });
          }

          return childrenWithSubChildren;
        }

        // Get parent chain
        const parentChain = [];
        let currentParentId = target.parentMessageId;
        let parentDepth = 1;

        while (currentParentId && parentDepth <= input.depth) {
          const parent = await db
            .select()
            .from(message)
            .where(and(eq(message.id, currentParentId), eq(message.isDeleted, false)))
            .limit(1);

          if (parent.length === 0) break;

          parentChain.unshift({ ...parent[0], depth: -parentDepth });
          currentParentId = parent[0].parentMessageId;
          parentDepth++;
        }

        // Get child messages
        const children = await getChildMessages(input.messageId, 0);

        return {
          targetMessage: { ...target, depth: 0 },
          parentChain,
          children,
          threadInfo: {
            totalParents: parentChain.length,
            totalChildren: children.length,
            maxDepthReached: input.depth,
            hasMoreParents: currentParentId !== null,
          },
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        console.error("Get message thread error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to retrieve message thread");
      }
    }),
};