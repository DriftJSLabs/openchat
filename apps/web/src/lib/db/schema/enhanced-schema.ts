import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

/**
 * Enhanced Database Schema for Advanced Chat Features
 * 
 * This file contains schema enhancements beyond the base shared.ts schema.
 * It includes advanced message editing, conversation threading, file attachments,
 * advanced analytics, and comprehensive chat management features.
 */

// Enhanced message editing and versioning
export const messageVersion = sqliteTable("message_version", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => message.id),
  version: integer("version").notNull(), // Version number (1, 2, 3, etc.)
  content: text("content").notNull(),
  editedAt: integer("edited_at", { mode: "timestamp" }).notNull(),
  editedBy: text("edited_by")
    .notNull()
    .references(() => user.id),
  editReason: text("edit_reason"), // Optional reason for the edit
  metadata: text("metadata"), // JSON metadata about the edit
  isActive: integer("is_active", { mode: "boolean" }).default(true), // Current active version
});

// File attachments for messages
export const messageAttachment = sqliteTable("message_attachment", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => message.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // MIME type
  fileSize: integer("file_size").notNull(), // Size in bytes
  filePath: text("file_path"), // Local file path or storage reference
  fileUrl: text("file_url"), // External URL if applicable
  thumbnailPath: text("thumbnail_path"), // Thumbnail for images/videos
  uploadStatus: text("upload_status", { 
    enum: ["pending", "uploading", "completed", "failed", "cancelled"] 
  }).default("pending"),
  uploadProgress: integer("upload_progress").default(0), // 0-100
  metadata: text("metadata"), // JSON metadata (dimensions, duration, etc.)
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Message reactions and interactions
export const messageReaction = sqliteTable("message_reaction", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => message.id),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  reactionType: text("reaction_type").notNull(), // emoji or custom reaction
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Chat participants for group chats
export const chatParticipant = sqliteTable("chat_participant", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  role: text("role", { enum: ["owner", "admin", "member", "viewer"] }).default("member"),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
  leftAt: integer("left_at", { mode: "timestamp" }),
  invitedBy: text("invited_by").references(() => user.id),
  permissions: text("permissions"), // JSON permissions object
  isActive: integer("is_active", { mode: "boolean" }).default(true),
});

// Chat templates for reusable conversation starters
export const chatTemplate = sqliteTable("chat_template", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"), // e.g., "work", "creative", "technical"
  isPublic: integer("is_public", { mode: "boolean" }).default(false),
  isSystem: integer("is_system", { mode: "boolean" }).default(false), // System-provided templates
  promptTemplate: text("prompt_template").notNull(), // Template with placeholders
  variables: text("variables"), // JSON array of variable definitions
  tags: text("tags"), // JSON array of tags
  useCount: integer("use_count").default(0),
  rating: real("rating").default(0), // Average user rating
  ratingCount: integer("rating_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Advanced chat settings and configurations
export const chatSettings = sqliteTable("chat_settings", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id),
  // AI Model settings
  modelProvider: text("model_provider").default("openai"), // openai, anthropic, local, etc.
  modelName: text("model_name").default("gpt-4"),
  temperature: real("temperature").default(0.7),
  maxTokens: integer("max_tokens").default(2048),
  topP: real("top_p").default(1.0),
  frequencyPenalty: real("frequency_penalty").default(0.0),
  presencePenalty: real("presence_penalty").default(0.0),
  systemPrompt: text("system_prompt"),
  // Chat behavior settings
  autoTitle: integer("auto_title", { mode: "boolean" }).default(true),
  autoSave: integer("auto_save", { mode: "boolean" }).default(true),
  enableTyping: integer("enable_typing", { mode: "boolean" }).default(true),
  enableReadReceipts: integer("enable_read_receipts", { mode: "boolean" }).default(true),
  // Context and memory settings
  contextWindow: integer("context_window").default(8192),
  memoryEnabled: integer("memory_enabled", { mode: "boolean" }).default(true),
  memoryStrategy: text("memory_strategy", { 
    enum: ["full", "summarize", "sliding_window", "semantic"] 
  }).default("sliding_window"),
  // Privacy and sharing
  isPrivate: integer("is_private", { mode: "boolean" }).default(true),
  allowSharing: integer("allow_sharing", { mode: "boolean" }).default(false),
  shareToken: text("share_token"), // Token for public sharing
  shareExpiry: integer("share_expiry", { mode: "timestamp" }),
  // Customization
  customInstructions: text("custom_instructions"),
  responseFormat: text("response_format", { 
    enum: ["default", "code", "markdown", "json", "structured"] 
  }).default("default"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Conversation branches for exploring different paths
export const conversationBranch = sqliteTable("conversation_branch", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id),
  parentMessageId: text("parent_message_id")
    .references(() => message.id),
  branchName: text("branch_name").notNull(),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).default(false),
  messageCount: integer("message_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Enhanced analytics with detailed metrics
export const detailedAnalytics = sqliteTable("detailed_analytics", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  chatId: text("chat_id")
    .references(() => chat.id),
  date: text("date").notNull(), // YYYY-MM-DD format
  // Message metrics
  messagesCreated: integer("messages_created").default(0),
  messagesEdited: integer("messages_edited").default(0),
  messagesDeleted: integer("messages_deleted").default(0),
  charactersTyped: integer("characters_typed").default(0),
  wordsTyped: integer("words_typed").default(0),
  // Token usage
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  estimatedCost: real("estimated_cost").default(0),
  // Time metrics
  activeTimeMinutes: integer("active_time_minutes").default(0),
  averageResponseTime: integer("average_response_time").default(0), // milliseconds
  longestSession: integer("longest_session").default(0), // minutes
  // Feature usage
  templatesUsed: integer("templates_used").default(0),
  attachmentsUploaded: integer("attachments_uploaded").default(0),
  branchesCreated: integer("branches_created").default(0),
  // Quality metrics
  regenerationCount: integer("regeneration_count").default(0),
  thumbsUp: integer("thumbs_up").default(0),
  thumbsDown: integer("thumbs_down").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Smart suggestions and auto-completion
export const smartSuggestion = sqliteTable("smart_suggestion", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  chatId: text("chat_id")
    .references(() => chat.id),
  suggestionType: text("suggestion_type", { 
    enum: ["completion", "template", "action", "correction"] 
  }).notNull(),
  triggerContext: text("trigger_context").notNull(), // What triggered the suggestion
  suggestion: text("suggestion").notNull(),
  confidence: real("confidence").default(0), // 0-1 confidence score
  wasAccepted: integer("was_accepted", { mode: "boolean" }),
  wasShown: integer("was_shown", { mode: "boolean" }).default(false),
  metadata: text("metadata"), // JSON metadata
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Export enhanced message table with new fields
export const message = sqliteTable("message", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id),
  branchId: text("branch_id")
    .references(() => conversationBranch.id),
  parentMessageId: text("parent_message_id")
    .references(() => message.id),
  role: text("role", { enum: ["user", "assistant", "system", "function"] }).notNull(),
  content: text("content").notNull(),
  originalContent: text("original_content"), // Store original before edits
  // Enhanced message fields
  messageType: text("message_type", { 
    enum: ["text", "image", "file", "code", "system", "function_call", "function_result"] 
  }).notNull().default("text"),
  metadata: text("metadata"), // JSON metadata (tokens, model info, etc.)
  editHistory: text("edit_history"), // JSON array of edit timestamps
  tokenCount: integer("token_count").default(0),
  // Quality and feedback
  qualityScore: real("quality_score"), // AI-generated quality score
  userRating: integer("user_rating"), // User feedback rating (1-5)
  flagged: integer("flagged", { mode: "boolean" }).default(false),
  flagReason: text("flag_reason"),
  // Processing status
  processingStatus: text("processing_status", { 
    enum: ["pending", "processing", "completed", "error", "cancelled"] 
  }).default("completed"),
  processingError: text("processing_error"),
  // Advanced features
  hasAttachments: integer("has_attachments", { mode: "boolean" }).default(false),
  attachmentCount: integer("attachment_count").default(0),
  reactionCount: integer("reaction_count").default(0),
  // Timing
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
}, (table) => ({
  // Indexes for better query performance
  chatIdIdx: index("idx_message_chat_id").on(table.chatId),
  branchIdIdx: index("idx_message_branch_id").on(table.branchId),
  createdAtIdx: index("idx_message_created_at").on(table.createdAt),
  parentIdIdx: index("idx_message_parent_id").on(table.parentMessageId),
}));

// Export enhanced chat table with new fields
export const chat = sqliteTable("chat", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  // Enhanced chat fields
  chatType: text("chat_type", { 
    enum: ["conversation", "assistant", "group", "system", "template", "shared"] 
  }).notNull().default("conversation"),
  category: text("category"), // User-defined category
  subcategory: text("subcategory"), // User-defined subcategory
  tags: text("tags"), // JSON array of tags
  description: text("description"), // Optional chat description
  // Status and visibility
  status: text("status", { 
    enum: ["active", "archived", "deleted", "template", "shared"] 
  }).default("active"),
  visibility: text("visibility", { 
    enum: ["private", "shared", "public", "team"] 
  }).default("private"),
  isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
  priority: integer("priority").default(0), // User-defined priority (0-10)
  // Activity tracking
  lastActivityAt: integer("last_activity_at", { mode: "timestamp" }),
  lastMessageAt: integer("last_message_at", { mode: "timestamp" }),
  messageCount: integer("message_count").default(0),
  participantCount: integer("participant_count").default(1),
  // Advanced features
  hasCustomInstructions: integer("has_custom_instructions", { mode: "boolean" }).default(false),
  hasBranches: integer("has_branches", { mode: "boolean" }).default(false),
  branchCount: integer("branch_count").default(0),
  averageRating: real("average_rating").default(0),
  totalRatings: integer("total_ratings").default(0),
  // Sharing and collaboration
  shareCount: integer("share_count").default(0),
  isPublicTemplate: integer("is_public_template", { mode: "boolean" }).default(false),
  // Metadata
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
}, (table) => ({
  // Indexes for better query performance
  userIdIdx: index("idx_chat_user_id").on(table.userId),
  categoryIdx: index("idx_chat_category").on(table.category),
  statusIdx: index("idx_chat_status").on(table.status),
  lastActivityIdx: index("idx_chat_last_activity").on(table.lastActivityAt),
}));

// Re-export user table from shared schema for consistency
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  // Enhanced user fields
  username: text("username").unique(), // Optional username
  bio: text("bio"), // User biography
  timezone: text("timezone").default("UTC"),
  language: text("language").default("en"),
  // Activity tracking
  lastActiveAt: integer("last_active_at", { mode: "timestamp" }),
  chatCount: integer("chat_count").default(0),
  messageCount: integer("message_count").default(0),
  // Preferences
  isOnline: integer("is_online", { mode: "boolean" }).default(false),
  allowNotifications: integer("allow_notifications", { mode: "boolean" }).default(true),
  allowAnalytics: integer("allow_analytics", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Define relations between tables
export const chatRelations = relations(chat, ({ one, many }) => ({
  user: one(user, {
    fields: [chat.userId],
    references: [user.id],
  }),
  messages: many(message),
  participants: many(chatParticipant),
  settings: one(chatSettings, {
    fields: [chat.id],
    references: [chatSettings.chatId],
  }),
  branches: many(conversationBranch),
}));

export const messageRelations = relations(message, ({ one, many }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }),
  parent: one(message, {
    fields: [message.parentMessageId],
    references: [message.id],
  }),
  replies: many(message),
  versions: many(messageVersion),
  attachments: many(messageAttachment),
  reactions: many(messageReaction),
  branch: one(conversationBranch, {
    fields: [message.branchId],
    references: [conversationBranch.id],
  }),
}));

export const messageVersionRelations = relations(messageVersion, ({ one }) => ({
  message: one(message, {
    fields: [messageVersion.messageId],
    references: [message.id],
  }),
  editedByUser: one(user, {
    fields: [messageVersion.editedBy],
    references: [user.id],
  }),
}));

// Export TypeScript types
export type EnhancedChat = typeof chat.$inferSelect;
export type EnhancedMessage = typeof message.$inferSelect;
export type MessageVersion = typeof messageVersion.$inferSelect;
export type MessageAttachment = typeof messageAttachment.$inferSelect;
export type MessageReaction = typeof messageReaction.$inferSelect;
export type ChatParticipant = typeof chatParticipant.$inferSelect;
export type ChatTemplate = typeof chatTemplate.$inferSelect;
export type ChatSettings = typeof chatSettings.$inferSelect;
export type ConversationBranch = typeof conversationBranch.$inferSelect;
export type DetailedAnalytics = typeof detailedAnalytics.$inferSelect;
export type SmartSuggestion = typeof smartSuggestion.$inferSelect;

export type InsertMessageVersion = typeof messageVersion.$inferInsert;
export type InsertMessageAttachment = typeof messageAttachment.$inferInsert;
export type InsertMessageReaction = typeof messageReaction.$inferInsert;
export type InsertChatParticipant = typeof chatParticipant.$inferInsert;
export type InsertChatTemplate = typeof chatTemplate.$inferInsert;
export type InsertChatSettings = typeof chatSettings.$inferInsert;
export type InsertConversationBranch = typeof conversationBranch.$inferInsert;
export type InsertDetailedAnalytics = typeof detailedAnalytics.$inferInsert;
export type InsertSmartSuggestion = typeof smartSuggestion.$inferInsert;