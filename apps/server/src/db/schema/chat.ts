import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const chat = sqliteTable("chat", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  // Enhanced chat fields
  chatType: text("chat_type", { enum: ["conversation", "assistant", "group", "system"] }).notNull().default("conversation"),
  settings: text("settings"), // JSON stringified chat settings
  tags: text("tags"), // JSON array of tags
  isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
  isArchived: integer("is_archived", { mode: "boolean" }).default(false),
  lastActivityAt: integer("last_activity_at", { mode: "timestamp" }),
  messageCount: integer("message_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
});

export const message = sqliteTable("message", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  // Enhanced message fields
  messageType: text("message_type", { enum: ["text", "image", "file", "code", "system"] }).notNull().default("text"),
  metadata: text("metadata"), // JSON stringified metadata (tokens, model info, etc.)
  parentMessageId: text("parent_message_id"), // For threaded conversations - self-reference handled separately
  editHistory: text("edit_history"), // JSON array of previous versions
  tokenCount: integer("token_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
});

export const syncEvent = sqliteTable("sync_event", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", { enum: ["user", "chat", "message", "analytics", "preference"] }).notNull(),
  entityId: text("entity_id").notNull(),
  operation: text("operation", { enum: ["create", "update", "delete", "batch_create", "batch_update"] }).notNull(),
  data: text("data"), // JSON stringified data
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  userId: text("user_id").notNull(),
  deviceId: text("device_id").notNull(),
  synced: integer("synced", { mode: "boolean" }).default(false),
  // Enhanced sync tracking
  priority: integer("priority").default(1), // 1=low, 2=normal, 3=high
  retryCount: integer("retry_count").default(0),
  lastRetryAt: integer("last_retry_at", { mode: "timestamp" }),
  errorMessage: text("error_message"),
});

export const device = sqliteTable("device", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  fingerprint: text("fingerprint").notNull().unique(),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const syncConfig = sqliteTable("sync_config", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  mode: text("mode", { enum: ["local-only", "cloud-only", "hybrid"] }).notNull().default("hybrid"),
  autoSync: integer("auto_sync", { mode: "boolean" }).default(true),
  syncInterval: integer("sync_interval").default(30000),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Chat analytics table for tracking usage patterns and performance metrics
export const chatAnalytics = sqliteTable("chat_analytics", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  chatId: text("chat_id")
    .references(() => chat.id),
  // Analytics metrics
  totalMessages: integer("total_messages").default(0),
  totalTokens: integer("total_tokens").default(0),
  avgResponseTime: integer("avg_response_time").default(0), // milliseconds
  totalCharacters: integer("total_characters").default(0),
  sessionsCount: integer("sessions_count").default(0),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  // Time-based analytics
  dailyUsage: text("daily_usage"), // JSON object tracking daily usage patterns
  weeklyUsage: text("weekly_usage"), // JSON object tracking weekly usage patterns
  monthlyUsage: text("monthly_usage"), // JSON object tracking monthly usage patterns
  // Performance metrics
  errorCount: integer("error_count").default(0),
  successfulResponses: integer("successful_responses").default(0),
  avgTokensPerMessage: integer("avg_tokens_per_message").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// User preferences table for storing user-specific settings and preferences
export const userPreferences = sqliteTable("user_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  // UI/UX preferences
  theme: text("theme", { enum: ["light", "dark", "system"] }).default("system"),
  language: text("language").default("en"),
  fontSize: text("font_size", { enum: ["small", "medium", "large"] }).default("medium"),
  compactMode: integer("compact_mode", { mode: "boolean" }).default(false),
  // Chat preferences
  defaultChatType: text("default_chat_type", { enum: ["conversation", "assistant", "group", "system"] }).default("conversation"),
  autoSaveChats: integer("auto_save_chats", { mode: "boolean" }).default(true),
  showTimestamps: integer("show_timestamps", { mode: "boolean" }).default(true),
  enableNotifications: integer("enable_notifications", { mode: "boolean" }).default(true),
  // AI behavior preferences
  defaultModel: text("default_model").default("gpt-4"),
  temperature: integer("temperature").default(70), // 0-100 scale
  maxTokens: integer("max_tokens").default(2048),
  contextWindow: integer("context_window").default(8192),
  // Privacy and data preferences
  allowAnalytics: integer("allow_analytics", { mode: "boolean" }).default(true),
  allowDataSharing: integer("allow_data_sharing", { mode: "boolean" }).default(false),
  retentionPeriod: integer("retention_period").default(365), // days
  // Export/import preferences
  exportFormat: text("export_format", { enum: ["json", "markdown", "txt"] }).default("json"),
  includeMetadata: integer("include_metadata", { mode: "boolean" }).default(true),
  // Custom preferences (JSON for extensibility)
  customSettings: text("custom_settings"), // JSON object for additional user-defined preferences
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// AI usage tracking table for monitoring AI model usage, costs, and performance
export const aiUsage = sqliteTable("ai_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  chatId: text("chat_id")
    .references(() => chat.id), // Optional - some operations might not be chat-specific
  messageId: text("message_id")
    .references(() => message.id), // Optional - links to specific message if applicable
  // AI operation details
  operation: text("operation", { enum: ["generation", "embedding", "moderation", "summarization", "translation", "analysis"] }).notNull(),
  model: text("model").notNull(), // e.g., "gpt-4", "claude-3-sonnet-20240229"
  provider: text("provider", { enum: ["openai", "anthropic", "google", "local"] }).notNull(),
  // Usage metrics
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  // Cost and performance tracking
  cost: integer("cost").default(0), // Cost in micro-cents (1/1000000 of a cent) for precision
  latency: integer("latency").default(0), // Response time in milliseconds
  // Status and quality metrics
  status: text("status", { enum: ["success", "error", "timeout", "rate_limited"] }).notNull(),
  errorMessage: text("error_message"),
  finishReason: text("finish_reason", { enum: ["stop", "length", "content_filter", "function_call"] }),
  // Quality metrics (if available)
  qualityScore: integer("quality_score"), // 0-100 score if quality assessment is available
  userFeedback: text("user_feedback", { enum: ["positive", "negative", "neutral"] }),
  // Metadata and context
  requestMetadata: text("request_metadata"), // JSON string with additional request context
  responseMetadata: text("response_metadata"), // JSON string with additional response context
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export type Chat = typeof chat.$inferSelect;
export type Message = typeof message.$inferSelect;
export type SyncEvent = typeof syncEvent.$inferSelect;
export type Device = typeof device.$inferSelect;
export type SyncConfig = typeof syncConfig.$inferSelect;
export type ChatAnalytics = typeof chatAnalytics.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;

export type InsertChat = typeof chat.$inferInsert;
export type InsertMessage = typeof message.$inferInsert;
export type InsertSyncEvent = typeof syncEvent.$inferInsert;
export type InsertDevice = typeof device.$inferInsert;
export type InsertSyncConfig = typeof syncConfig.$inferInsert;
export type InsertChatAnalytics = typeof chatAnalytics.$inferInsert;
export type InsertUserPreferences = typeof userPreferences.$inferInsert;
export type InsertAiUsage = typeof aiUsage.$inferInsert;