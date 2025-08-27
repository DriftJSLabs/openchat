import { pgTable, text, integer, timestamp, boolean, serial, uuid, index, primaryKey } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Conversations table - supports both direct messages and group chats
 * Replaces the old 'chat' table with more comprehensive conversation management
 */
export const conversation = pgTable("conversation", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Conversation metadata
  title: text("title"), // Optional title (auto-generated for DMs, custom for groups)
  description: text("description"), // Optional conversation description
  
  // Conversation type and settings
  type: text("type", { 
    enum: ["direct", "group", "channel", "assistant"] 
  }).notNull().default("direct"),
  
  // Group/channel specific settings
  isPublic: boolean("is_public").default(false), // Public channels vs private groups
  inviteCode: text("invite_code").unique(), // Shareable invite link for groups
  maxParticipants: integer("max_participants"), // Optional participant limit
  
  // Conversation status and permissions
  isActive: boolean("is_active").default(true),
  isArchived: boolean("is_archived").default(false),
  isDeleted: boolean("is_deleted").default(false),
  
  // Creator and admin management
  createdBy: uuid("created_by")
    .notNull()
    .references(() => user.id),
  
  // Activity tracking
  lastMessageAt: timestamp("last_message_at"),
  lastActivityAt: timestamp("last_activity_at"),
  messageCount: integer("message_count").default(0),
  participantCount: integer("participant_count").default(0),
  
  // Conversation settings (JSON)
  settings: text("settings"), // JSON: notifications, permissions, etc.
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Performance indexes
  typeIdx: index("conversation_type_idx").on(table.type),
  createdByIdx: index("conversation_created_by_idx").on(table.createdBy),
  lastActivityIdx: index("conversation_last_activity_idx").on(table.lastActivityAt),
  activeIdx: index("conversation_active_idx").on(table.isActive, table.isDeleted),
  inviteCodeIdx: index("conversation_invite_code_idx").on(table.inviteCode),
}));

/**
 * Conversation participants - many-to-many relationship between users and conversations
 * Handles permissions, roles, and participant-specific settings
 */
export const conversationParticipant = pgTable("conversation_participant", {
  id: uuid("id").defaultRandom(),
  
  // Core relationship
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  
  // Participant role and permissions
  role: text("role", { 
    enum: ["owner", "admin", "moderator", "member", "guest"] 
  }).notNull().default("member"),
  
  // Participant status
  status: text("status", { 
    enum: ["active", "invited", "left", "removed", "banned"] 
  }).notNull().default("active"),
  
  // Permissions
  canAddMembers: boolean("can_add_members").default(false),
  canRemoveMembers: boolean("can_remove_members").default(false),
  canEditConversation: boolean("can_edit_conversation").default(false),
  canDeleteMessages: boolean("can_delete_messages").default(false),
  canPinMessages: boolean("can_pin_messages").default(false),
  
  // Participant-specific settings
  notificationsEnabled: boolean("notifications_enabled").default(true),
  mutedUntil: timestamp("muted_until"), // Temporary mute
  isMuted: boolean("is_muted").default(false), // Permanent mute
  
  // Read status tracking
  lastReadMessageId: uuid("last_read_message_id"), // Last message this user read
  lastReadAt: timestamp("last_read_at"), // When they last read messages
  unreadCount: integer("unread_count").default(0), // Cached unread count
  
  // Activity tracking
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  leftAt: timestamp("left_at"), // When they left (if applicable)
  invitedBy: uuid("invited_by").references(() => user.id), // Who invited them
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Ensure unique participant per conversation
  unique: primaryKey({ columns: [table.conversationId, table.userId] }),
  // Performance indexes
  conversationIdx: index("participant_conversation_idx").on(table.conversationId),
  userIdx: index("participant_user_idx").on(table.userId),
  statusIdx: index("participant_status_idx").on(table.status),
  roleIdx: index("participant_role_idx").on(table.role),
  lastReadIdx: index("participant_last_read_idx").on(table.lastReadAt),
}));

/**
 * Enhanced messages table with comprehensive threading and content type support
 */
export const message = pgTable("message", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Core message data
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => user.id),
  
  // Message content and type
  content: text("content").notNull(),
  contentType: text("content_type", { 
    enum: ["text", "image", "file", "audio", "video", "code", "system", "poll", "location"] 
  }).notNull().default("text"),
  
  // Message formatting and metadata
  formattedContent: text("formatted_content"), // HTML/Markdown formatted version
  mentions: text("mentions"), // JSON array of mentioned user IDs
  hashtags: text("hashtags"), // JSON array of hashtags
  metadata: text("metadata"), // JSON: AI model info, file info, etc.
  
  // Threading support
  threadRootId: uuid("thread_root_id"), // Root message of thread
  parentMessageId: uuid("parent_message_id"), // Direct parent message
  threadOrder: integer("thread_order").default(0), // Order within thread
  replyCount: integer("reply_count").default(0), // Number of replies
  
  // Message status and lifecycle
  status: text("status", { 
    enum: ["sending", "sent", "delivered", "read", "failed", "edited", "deleted"] 
  }).notNull().default("sent"),
  
  // Edit and version control
  editHistory: text("edit_history"), // JSON array of previous versions
  editedAt: timestamp("edited_at"),
  editedBy: uuid("edited_by").references(() => user.id),
  
  // Message reactions and engagement
  reactions: text("reactions"), // JSON object with reaction counts
  isPinned: boolean("is_pinned").default(false),
  pinnedAt: timestamp("pinned_at"),
  pinnedBy: uuid("pinned_by").references(() => user.id),
  
  // Delivery and read tracking
  deliveredAt: timestamp("delivered_at"),
  readByCount: integer("read_by_count").default(0), // Cache for performance
  
  // AI and system messages
  isSystemMessage: boolean("is_system_message").default(false),
  systemMessageType: text("system_message_type", { 
    enum: ["join", "leave", "add_member", "remove_member", "title_change", "settings_change"] 
  }),
  
  // Content moderation
  isModerated: boolean("is_moderated").default(false),
  moderationReason: text("moderation_reason"),
  moderatedAt: timestamp("moderated_at"),
  moderatedBy: uuid("moderated_by").references(() => user.id),
  
  // Soft delete and archival
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),
  deletedBy: uuid("deleted_by").references(() => user.id),
  
  // AI specific fields
  tokenCount: integer("token_count").default(0),
  model: text("model"), // AI model used for generation
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Critical performance indexes
  conversationCreatedIdx: index("message_conversation_created_idx").on(table.conversationId, table.createdAt),
  senderIdx: index("message_sender_idx").on(table.senderId),
  threadRootIdx: index("message_thread_root_idx").on(table.threadRootId),
  parentIdx: index("message_parent_idx").on(table.parentMessageId),
  statusIdx: index("message_status_idx").on(table.status),
  contentTypeIdx: index("message_content_type_idx").on(table.contentType),
  pinnedIdx: index("message_pinned_idx").on(table.isPinned),
  deletedIdx: index("message_deleted_idx").on(table.isDeleted),
}));

/**
 * File attachments table - supports comprehensive file management
 */
export const attachment = pgTable("attachment", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Core attachment data
  messageId: uuid("message_id")
    .notNull()
    .references(() => message.id, { onDelete: "cascade" }),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => user.id),
  
  // File information
  filename: text("filename").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(), // Size in bytes
  
  // Storage information
  storageProvider: text("storage_provider", { 
    enum: ["local", "s3", "gcs", "azure", "cloudinary"] 
  }).notNull().default("local"),
  storageKey: text("storage_key").notNull(), // Storage provider's key/path
  storageUrl: text("storage_url"), // Direct access URL
  
  // File metadata and processing
  metadata: text("metadata"), // JSON: dimensions, duration, etc.
  thumbnailUrl: text("thumbnail_url"), // Thumbnail for images/videos
  previewUrl: text("preview_url"), // Preview URL for documents
  
  // Content analysis (AI-powered)
  contentDescription: text("content_description"), // AI-generated description
  extractedText: text("extracted_text"), // OCR/text extraction results
  tags: text("tags"), // JSON array of auto-generated tags
  
  // Security and access control
  isPublic: boolean("is_public").default(false),
  accessToken: text("access_token"), // Temporary access token for secure files
  expiresAt: timestamp("expires_at"), // Auto-deletion timestamp
  
  // Virus scanning and moderation
  isScanned: boolean("is_scanned").default(false),
  scanResult: text("scan_result", { enum: ["clean", "infected", "suspicious", "pending"] }),
  scanDetails: text("scan_details"), // JSON with scan details
  
  // Processing status
  processingStatus: text("processing_status", { 
    enum: ["pending", "processing", "completed", "failed"] 
  }).notNull().default("pending"),
  processingError: text("processing_error"),
  
  // Usage tracking
  downloadCount: integer("download_count").default(0),
  lastAccessedAt: timestamp("last_accessed_at"),
  
  // Soft delete
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Performance indexes
  messageIdx: index("attachment_message_idx").on(table.messageId),
  uploaderIdx: index("attachment_uploader_idx").on(table.uploadedBy),
  mimeTypeIdx: index("attachment_mime_type_idx").on(table.mimeType),
  processingStatusIdx: index("attachment_processing_status_idx").on(table.processingStatus),
  storageKeyIdx: index("attachment_storage_key_idx").on(table.storageKey),
}));

/**
 * User relationships table - handles friendships, blocks, and social connections
 */
export const userRelationship = pgTable("user_relationship", {
  id: uuid("id").defaultRandom(),
  
  // Core relationship
  fromUserId: uuid("from_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  toUserId: uuid("to_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  
  // Relationship type and status
  type: text("type", { 
    enum: ["friend", "block", "follow", "mute"] 
  }).notNull(),
  status: text("status", { 
    enum: ["pending", "accepted", "rejected", "active", "inactive"] 
  }).notNull().default("pending"),
  
  // Request metadata
  requestMessage: text("request_message"), // Optional message with friend request
  responseMessage: text("response_message"), // Optional response message
  
  // Relationship settings
  canSeeOnlineStatus: boolean("can_see_online_status").default(true),
  canSendMessages: boolean("can_send_messages").default(true),
  canSeeProfile: boolean("can_see_profile").default(true),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  
  // Activity tracking
  lastInteractionAt: timestamp("last_interaction_at"),
  interactionCount: integer("interaction_count").default(0),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at"), // When relationship was accepted
}, (table) => ({
  // Ensure unique bidirectional relationships
  unique: primaryKey({ columns: [table.fromUserId, table.toUserId, table.type] }),
  // Performance indexes
  fromUserIdx: index("relationship_from_user_idx").on(table.fromUserId),
  toUserIdx: index("relationship_to_user_idx").on(table.toUserId),
  typeStatusIdx: index("relationship_type_status_idx").on(table.type, table.status),
  lastInteractionIdx: index("relationship_last_interaction_idx").on(table.lastInteractionAt),
}));

// Keep the existing chat table for backward compatibility during migration
export const chat = pgTable("chat", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  // Enhanced chat fields
  chatType: text("chat_type", { enum: ["conversation", "assistant", "group", "system"] }).notNull().default("conversation"),
  settings: text("settings"), // JSON stringified chat settings
  tags: text("tags"), // JSON array of tags
  isPinned: boolean("is_pinned").default(false),
  isArchived: boolean("is_archived").default(false),
  lastActivityAt: timestamp("last_activity_at"),
  messageCount: integer("message_count").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").default(false),
});

export const syncEvent = pgTable("sync_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type", { enum: ["user", "chat", "message", "analytics", "preference"] }).notNull(),
  entityId: text("entity_id").notNull(),
  operation: text("operation", { enum: ["create", "update", "delete", "batch_create", "batch_update"] }).notNull(),
  data: text("data"), // JSON stringified data
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  userId: uuid("user_id").notNull(),
  deviceId: text("device_id").notNull(),
  synced: boolean("synced").default(false),
  // Enhanced sync tracking
  priority: integer("priority").default(1), // 1=low, 2=normal, 3=high
  retryCount: integer("retry_count").default(0),
  lastRetryAt: timestamp("last_retry_at"),
  errorMessage: text("error_message"),
});

export const device = pgTable("device", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  fingerprint: text("fingerprint").notNull().unique(),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const syncConfig = pgTable("sync_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  mode: text("mode", { enum: ["local-only", "cloud-only", "hybrid"] }).notNull().default("hybrid"),
  autoSync: boolean("auto_sync").default(true),
  syncInterval: integer("sync_interval").default(30000),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Chat analytics table for tracking usage patterns and performance metrics
export const chatAnalytics = pgTable("chat_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  chatId: uuid("chat_id")
    .references(() => chat.id),
  // Analytics metrics
  totalMessages: integer("total_messages").default(0),
  totalTokens: integer("total_tokens").default(0),
  avgResponseTime: integer("avg_response_time").default(0), // milliseconds
  totalCharacters: integer("total_characters").default(0),
  sessionsCount: integer("sessions_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  // Time-based analytics
  dailyUsage: text("daily_usage"), // JSON object tracking daily usage patterns
  weeklyUsage: text("weekly_usage"), // JSON object tracking weekly usage patterns
  monthlyUsage: text("monthly_usage"), // JSON object tracking monthly usage patterns
  // Performance metrics
  errorCount: integer("error_count").default(0),
  successfulResponses: integer("successful_responses").default(0),
  avgTokensPerMessage: integer("avg_tokens_per_message").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// User preferences table for storing user-specific settings and preferences
export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  // UI/UX preferences
  theme: text("theme", { enum: ["light", "dark", "system"] }).default("system"),
  language: text("language").default("en"),
  fontSize: text("font_size", { enum: ["small", "medium", "large"] }).default("medium"),
  compactMode: boolean("compact_mode").default(false),
  // Chat preferences
  defaultChatType: text("default_chat_type", { enum: ["conversation", "assistant", "group", "system"] }).default("conversation"),
  autoSaveChats: boolean("auto_save_chats").default(true),
  showTimestamps: boolean("show_timestamps").default(true),
  enableNotifications: boolean("enable_notifications").default(true),
  // AI behavior preferences
  defaultModel: text("default_model").default("gpt-4"),
  temperature: integer("temperature").default(70), // 0-100 scale
  maxTokens: integer("max_tokens").default(2048),
  contextWindow: integer("context_window").default(8192),
  // Privacy and data preferences
  allowAnalytics: boolean("allow_analytics").default(true),
  allowDataSharing: boolean("allow_data_sharing").default(false),
  retentionPeriod: integer("retention_period").default(365), // days
  // Export/import preferences
  exportFormat: text("export_format", { enum: ["json", "markdown", "txt"] }).default("json"),
  includeMetadata: boolean("include_metadata").default(true),
  // Custom preferences (JSON for extensibility)
  customSettings: text("custom_settings"), // JSON object for additional user-defined preferences
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// AI usage tracking table for monitoring AI model usage, costs, and performance
export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  chatId: uuid("chat_id")
    .references(() => chat.id), // Optional - some operations might not be chat-specific
  messageId: uuid("message_id")
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Enhanced type exports for the new schema tables
export type Conversation = typeof conversation.$inferSelect;
export type ConversationParticipant = typeof conversationParticipant.$inferSelect;
export type Message = typeof message.$inferSelect;
export type Attachment = typeof attachment.$inferSelect;
export type UserRelationship = typeof userRelationship.$inferSelect;

// Legacy table types (for backward compatibility)
export type Chat = typeof chat.$inferSelect;
export type SyncEvent = typeof syncEvent.$inferSelect;
export type Device = typeof device.$inferSelect;
export type SyncConfig = typeof syncConfig.$inferSelect;
export type ChatAnalytics = typeof chatAnalytics.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;

// Insert type exports for the new schema tables
export type InsertConversation = typeof conversation.$inferInsert;
export type InsertConversationParticipant = typeof conversationParticipant.$inferInsert;
export type InsertMessage = typeof message.$inferInsert;
export type InsertAttachment = typeof attachment.$inferInsert;
export type InsertUserRelationship = typeof userRelationship.$inferInsert;

// Legacy table insert types (for backward compatibility)
export type InsertChat = typeof chat.$inferInsert;
export type InsertSyncEvent = typeof syncEvent.$inferInsert;
export type InsertDevice = typeof device.$inferInsert;
export type InsertSyncConfig = typeof syncConfig.$inferInsert;
export type InsertChatAnalytics = typeof chatAnalytics.$inferInsert;
export type InsertUserPreferences = typeof userPreferences.$inferInsert;
export type InsertAiUsage = typeof aiUsage.$inferInsert;