import { z } from "zod";

/**
 * Comprehensive Zod validation schemas that match the database schema definitions
 * These schemas ensure type safety and validation for all database operations
 * and API endpoints that interact with the chat application data
 */

// Core validation primitives
const uuidSchema = z.string().uuid("Invalid UUID format");
const emailSchema = z.string().email("Invalid email format");
const urlSchema = z.string().url("Invalid URL format").optional();
const jsonStringSchema = z.string().optional();

// User validation schemas
export const userStatusSchema = z.enum(["online", "away", "busy", "invisible", "offline"]);

export const insertUserSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
  email: emailSchema,
  emailVerified: z.boolean(),
  image: z.string().url("Invalid image URL").optional(),
  
  // Enhanced profile fields
  displayName: z.string().max(255, "Display name too long").optional(),
  bio: z.string().max(500, "Bio too long").optional(),
  location: z.string().max(255, "Location too long").optional(),
  website: urlSchema,
  
  // Status and presence
  isOnline: z.boolean().default(false),
  lastSeenAt: z.date().optional(),
  status: userStatusSchema.default("offline"),
  customStatus: z.string().max(255, "Custom status too long").optional(),
  
  // Account management
  isActive: z.boolean().default(true),
  isDeleted: z.boolean().default(false),
  deletedAt: z.date().optional(),
  
  // Privacy settings
  isPrivate: z.boolean().default(false),
  allowFriendRequests: z.boolean().default(true),
  showOnlineStatus: z.boolean().default(true),
  
  // Timestamps
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectUserSchema = insertUserSchema.extend({
  id: uuidSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Conversation validation schemas
export const conversationTypeSchema = z.enum(["direct", "group", "channel", "assistant"]);

export const insertConversationSchema = z.object({
  id: uuidSchema.optional(),
  title: z.string().max(255, "Title too long").optional(),
  description: z.string().max(1000, "Description too long").optional(),
  type: conversationTypeSchema.default("direct"),
  
  // Group/channel settings
  isPublic: z.boolean().default(false),
  inviteCode: z.string().max(50, "Invite code too long").optional(),
  maxParticipants: z.number().int().positive("Max participants must be positive").optional(),
  
  // Status flags
  isActive: z.boolean().default(true),
  isArchived: z.boolean().default(false),
  isDeleted: z.boolean().default(false),
  
  // Creator reference
  createdBy: uuidSchema,
  
  // Activity tracking
  lastMessageAt: z.date().optional(),
  lastActivityAt: z.date().optional(),
  messageCount: z.number().int().min(0, "Message count cannot be negative").default(0),
  participantCount: z.number().int().min(0, "Participant count cannot be negative").default(0),
  
  // Settings
  settings: jsonStringSchema,
  
  // Timestamps
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectConversationSchema = insertConversationSchema.extend({
  id: uuidSchema,
  createdBy: uuidSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Conversation participant validation schemas
export const participantRoleSchema = z.enum(["owner", "admin", "moderator", "member", "guest"]);
export const participantStatusSchema = z.enum(["active", "invited", "left", "removed", "banned"]);

export const insertConversationParticipantSchema = z.object({
  id: uuidSchema.optional(),
  conversationId: uuidSchema,
  userId: uuidSchema,
  
  // Role and status
  role: participantRoleSchema.default("member"),
  status: participantStatusSchema.default("active"),
  
  // Permissions
  canAddMembers: z.boolean().default(false),
  canRemoveMembers: z.boolean().default(false),
  canEditConversation: z.boolean().default(false),
  canDeleteMessages: z.boolean().default(false),
  canPinMessages: z.boolean().default(false),
  
  // Settings
  notificationsEnabled: z.boolean().default(true),
  mutedUntil: z.date().optional(),
  isMuted: z.boolean().default(false),
  
  // Read status
  lastReadMessageId: uuidSchema.optional(),
  lastReadAt: z.date().optional(),
  unreadCount: z.number().int().min(0, "Unread count cannot be negative").default(0),
  
  // Activity tracking
  joinedAt: z.date().optional(),
  leftAt: z.date().optional(),
  invitedBy: uuidSchema.optional(),
  
  // Timestamps
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectConversationParticipantSchema = insertConversationParticipantSchema.extend({
  id: uuidSchema,
  conversationId: uuidSchema,
  userId: uuidSchema,
  joinedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Message validation schemas
export const messageContentTypeSchema = z.enum([
  "text", "image", "file", "audio", "video", "code", "system", "poll", "location"
]);

export const messageStatusSchema = z.enum([
  "sending", "sent", "delivered", "read", "failed", "edited", "deleted"
]);

export const systemMessageTypeSchema = z.enum([
  "join", "leave", "add_member", "remove_member", "title_change", "settings_change"
]);

export const insertMessageSchema = z.object({
  id: uuidSchema.optional(),
  conversationId: uuidSchema,
  senderId: uuidSchema,
  
  // Content
  content: z.string().min(1, "Message content cannot be empty").max(10000, "Message too long"),
  contentType: messageContentTypeSchema.default("text"),
  formattedContent: z.string().max(15000, "Formatted content too long").optional(),
  
  // Metadata
  mentions: jsonStringSchema, // JSON array of user IDs
  hashtags: jsonStringSchema, // JSON array of hashtags
  metadata: jsonStringSchema,
  
  // Threading
  threadRootId: uuidSchema.optional(),
  parentMessageId: uuidSchema.optional(),
  threadOrder: z.number().int().min(0, "Thread order cannot be negative").default(0),
  replyCount: z.number().int().min(0, "Reply count cannot be negative").default(0),
  
  // Status
  status: messageStatusSchema.default("sent"),
  
  // Edit history
  editHistory: jsonStringSchema,
  editedAt: z.date().optional(),
  editedBy: uuidSchema.optional(),
  
  // Reactions and engagement
  reactions: jsonStringSchema, // JSON object with reaction counts
  isPinned: z.boolean().default(false),
  pinnedAt: z.date().optional(),
  pinnedBy: uuidSchema.optional(),
  
  // Delivery tracking
  deliveredAt: z.date().optional(),
  readByCount: z.number().int().min(0, "Read count cannot be negative").default(0),
  
  // System messages
  isSystemMessage: z.boolean().default(false),
  systemMessageType: systemMessageTypeSchema.optional(),
  
  // Moderation
  isModerated: z.boolean().default(false),
  moderationReason: z.string().max(500, "Moderation reason too long").optional(),
  moderatedAt: z.date().optional(),
  moderatedBy: uuidSchema.optional(),
  
  // Soft delete
  isDeleted: z.boolean().default(false),
  deletedAt: z.date().optional(),
  deletedBy: uuidSchema.optional(),
  
  // AI fields
  tokenCount: z.number().int().min(0, "Token count cannot be negative").default(0),
  model: z.string().max(255, "Model name too long").optional(),
  
  // Timestamps
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectMessageSchema = insertMessageSchema.extend({
  id: uuidSchema,
  conversationId: uuidSchema,
  senderId: uuidSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Attachment validation schemas
export const storageProviderSchema = z.enum(["local", "s3", "gcs", "azure", "cloudinary"]);
export const scanResultSchema = z.enum(["clean", "infected", "suspicious", "pending"]);
export const processingStatusSchema = z.enum(["pending", "processing", "completed", "failed"]);

export const insertAttachmentSchema = z.object({
  id: uuidSchema.optional(),
  messageId: uuidSchema,
  uploadedBy: uuidSchema,
  
  // File information
  filename: z.string().min(1, "Filename is required").max(255, "Filename too long"),
  originalFilename: z.string().min(1, "Original filename is required").max(255, "Original filename too long"),
  mimeType: z.string().min(1, "MIME type is required").max(255, "MIME type too long"),
  fileSize: z.number().int().positive("File size must be positive"),
  
  // Storage
  storageProvider: storageProviderSchema.default("local"),
  storageKey: z.string().min(1, "Storage key is required").max(1000, "Storage key too long"),
  storageUrl: urlSchema,
  
  // Metadata
  metadata: jsonStringSchema,
  thumbnailUrl: urlSchema,
  previewUrl: urlSchema,
  
  // AI analysis
  contentDescription: z.string().max(1000, "Content description too long").optional(),
  extractedText: z.string().max(50000, "Extracted text too long").optional(),
  tags: jsonStringSchema,
  
  // Security
  isPublic: z.boolean().default(false),
  accessToken: z.string().max(255, "Access token too long").optional(),
  expiresAt: z.date().optional(),
  
  // Virus scanning
  isScanned: z.boolean().default(false),
  scanResult: scanResultSchema.optional(),
  scanDetails: jsonStringSchema,
  
  // Processing
  processingStatus: processingStatusSchema.default("pending"),
  processingError: z.string().max(1000, "Processing error too long").optional(),
  
  // Usage tracking
  downloadCount: z.number().int().min(0, "Download count cannot be negative").default(0),
  lastAccessedAt: z.date().optional(),
  
  // Soft delete
  isDeleted: z.boolean().default(false),
  deletedAt: z.date().optional(),
  
  // Timestamps
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectAttachmentSchema = insertAttachmentSchema.extend({
  id: uuidSchema,
  messageId: uuidSchema,
  uploadedBy: uuidSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// User relationship validation schemas
export const relationshipTypeSchema = z.enum(["friend", "block", "follow", "mute"]);
export const relationshipStatusSchema = z.enum(["pending", "accepted", "rejected", "active", "inactive"]);

export const insertUserRelationshipSchema = z.object({
  id: uuidSchema.optional(),
  fromUserId: uuidSchema,
  toUserId: uuidSchema,
  
  // Relationship details
  type: relationshipTypeSchema,
  status: relationshipStatusSchema.default("pending"),
  
  // Request messages
  requestMessage: z.string().max(500, "Request message too long").optional(),
  responseMessage: z.string().max(500, "Response message too long").optional(),
  
  // Settings
  canSeeOnlineStatus: z.boolean().default(true),
  canSendMessages: z.boolean().default(true),
  canSeeProfile: z.boolean().default(true),
  notificationsEnabled: z.boolean().default(true),
  
  // Activity tracking
  lastInteractionAt: z.date().optional(),
  interactionCount: z.number().int().min(0, "Interaction count cannot be negative").default(0),
  
  // Timestamps
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  acceptedAt: z.date().optional(),
});

export const selectUserRelationshipSchema = insertUserRelationshipSchema.extend({
  id: uuidSchema,
  fromUserId: uuidSchema,
  toUserId: uuidSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Validation for relationships to prevent self-relationships
export const validateRelationshipNotSelf = (data: { fromUserId: string; toUserId: string }) => {
  if (data.fromUserId === data.toUserId) {
    throw new Error("Cannot create relationship with yourself");
  }
  return data;
};

// Complex validation schemas for API operations
export const createDirectConversationSchema = z.object({
  participantUserId: uuidSchema,
  initialMessage: z.string().min(1, "Initial message is required").max(10000, "Message too long").optional(),
});

export const createGroupConversationSchema = z.object({
  title: z.string().min(1, "Group title is required").max(255, "Title too long"),
  description: z.string().max(1000, "Description too long").optional(),
  participantUserIds: z.array(uuidSchema).min(1, "At least one participant is required").max(100, "Too many participants"),
  isPublic: z.boolean().default(false),
  maxParticipants: z.number().int().positive("Max participants must be positive").optional(),
});

export const sendMessageSchema = z.object({
  conversationId: uuidSchema,
  content: z.string().min(1, "Message content cannot be empty").max(10000, "Message too long"),
  contentType: messageContentTypeSchema.default("text"),
  parentMessageId: uuidSchema.optional(), // For replies
  mentions: z.array(uuidSchema).optional(),
  metadata: z.record(z.any()).optional(), // Flexible metadata object
});

export const updateMessageSchema = z.object({
  messageId: uuidSchema,
  content: z.string().min(1, "Message content cannot be empty").max(10000, "Message too long"),
});

export const addParticipantSchema = z.object({
  conversationId: uuidSchema,
  userId: uuidSchema,
  role: participantRoleSchema.default("member"),
});

export const updateParticipantRoleSchema = z.object({
  conversationId: uuidSchema,
  userId: uuidSchema,
  role: participantRoleSchema,
});

export const markMessagesReadSchema = z.object({
  conversationId: uuidSchema,
  lastReadMessageId: uuidSchema,
});

// File upload validation
export const fileUploadSchema = z.object({
  messageId: uuidSchema,
  file: z.object({
    name: z.string().min(1, "Filename is required"),
    type: z.string().min(1, "File type is required"),
    size: z.number().int().positive("File size must be positive").max(100 * 1024 * 1024, "File too large (max 100MB)"),
  }),
  isPublic: z.boolean().default(false),
});

// Search and filtering schemas
export const conversationFilterSchema = z.object({
  type: conversationTypeSchema.optional(),
  isArchived: z.boolean().optional(),
  participantUserId: uuidSchema.optional(),
  search: z.string().max(255, "Search query too long").optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export const messageFilterSchema = z.object({
  conversationId: uuidSchema,
  contentType: messageContentTypeSchema.optional(),
  senderId: uuidSchema.optional(),
  afterDate: z.date().optional(),
  beforeDate: z.date().optional(),
  search: z.string().max(255, "Search query too long").optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// Export all schemas for easy import
export const schemas = {
  // User schemas
  insertUser: insertUserSchema,
  selectUser: selectUserSchema,
  userStatus: userStatusSchema,
  
  // Conversation schemas
  insertConversation: insertConversationSchema,
  selectConversation: selectConversationSchema,
  conversationType: conversationTypeSchema,
  
  // Participant schemas
  insertConversationParticipant: insertConversationParticipantSchema,
  selectConversationParticipant: selectConversationParticipantSchema,
  participantRole: participantRoleSchema,
  participantStatus: participantStatusSchema,
  
  // Message schemas
  insertMessage: insertMessageSchema,
  selectMessage: selectMessageSchema,
  messageContentType: messageContentTypeSchema,
  messageStatus: messageStatusSchema,
  systemMessageType: systemMessageTypeSchema,
  
  // Attachment schemas
  insertAttachment: insertAttachmentSchema,
  selectAttachment: selectAttachmentSchema,
  storageProvider: storageProviderSchema,
  processingStatus: processingStatusSchema,
  
  // Relationship schemas
  insertUserRelationship: insertUserRelationshipSchema,
  selectUserRelationship: selectUserRelationshipSchema,
  relationshipType: relationshipTypeSchema,
  relationshipStatus: relationshipStatusSchema,
  
  // API operation schemas
  createDirectConversation: createDirectConversationSchema,
  createGroupConversation: createGroupConversationSchema,
  sendMessage: sendMessageSchema,
  updateMessage: updateMessageSchema,
  addParticipant: addParticipantSchema,
  updateParticipantRole: updateParticipantRoleSchema,
  markMessagesRead: markMessagesReadSchema,
  fileUpload: fileUploadSchema,
  
  // Filter schemas
  conversationFilter: conversationFilterSchema,
  messageFilter: messageFilterSchema,
} as const;