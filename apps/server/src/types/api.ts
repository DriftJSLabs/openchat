/**
 * Comprehensive API type definitions for the OpenChat server
 * This file exports all types used by REST endpoints and WebSocket handlers
 * to ensure type safety across client-server communication
 */

import { z } from "zod";

// ========================================
// COMMON API RESPONSE TYPES
// ========================================

/**
 * Standard API response wrapper
 * All API endpoints return responses in this format for consistency
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Pagination metadata for list endpoints
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  totalPages?: number;
  currentPage?: number;
  hasPrevious?: boolean;
  cursors?: {
    before: string | null;
    after: string | null;
  };
}

/**
 * Search metadata for search endpoints
 */
export interface SearchMeta {
  query: string;
  resultsCount: number;
}

// ========================================
// CHAT API TYPES
// ========================================

/**
 * Chat creation request schema
 */
export const createChatSchema = z.object({
  title: z.string().min(1).max(200),
  chatType: z.enum(["conversation", "assistant", "group", "system"]).optional().default("conversation"),
  settings: z.record(z.any()).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

export type CreateChatRequest = z.infer<typeof createChatSchema>;

/**
 * Chat update request schema
 */
export const updateChatSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  settings: z.record(z.any()).optional(),
  tags: z.array(z.string()).max(10).optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export type UpdateChatRequest = z.infer<typeof updateChatSchema>;

/**
 * Enhanced chat response type with metadata
 */
export interface ChatWithMetadata {
  chat: {
    id: string;
    title: string;
    userId: string;
    chatType: "conversation" | "assistant" | "group" | "system";
    settings: Record<string, any> | null;
    tags: string[] | null;
    isPinned: boolean;
    isArchived: boolean;
    lastActivityAt: Date;
    messageCount: number;
    createdAt: Date;
    updatedAt: Date;
    isDeleted: boolean;
  };
  metadata: {
    messageCount: number;
    lastActivity: Date;
    lastMessage: any | null;
  };
}

/**
 * Chat list response with pagination
 */
export interface ChatsListResponse {
  chats: ChatWithMetadata["chat"][];
  pagination: PaginationMeta;
}

// ========================================
// MESSAGE API TYPES
// ========================================

/**
 * Message creation request schema
 */
export const createMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
  messageType: z.enum(["text", "image", "file", "code", "system"]).optional().default("text"),
  metadata: z.record(z.any()).optional(),
  parentMessageId: z.string().optional(),
  tokenCount: z.number().min(0).optional().default(0),
});

export type CreateMessageRequest = z.infer<typeof createMessageSchema>;

/**
 * Enhanced message response type
 */
export interface MessageWithMetadata {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  messageType: "text" | "image" | "file" | "code" | "system";
  metadata: Record<string, any> | null;
  parentMessageId: string | null;
  editHistory: any[] | null;
  tokenCount: number;
  createdAt: Date;
  isDeleted: boolean;
}

/**
 * Messages list response with pagination
 */
export interface MessagesListResponse {
  messages: MessageWithMetadata[];
  pagination: PaginationMeta;
}

// ========================================
// FILE UPLOAD API TYPES
// ========================================

/**
 * File upload configuration
 */
export interface FileUploadConfig {
  maxFileSize: number;
  maxFilesPerMessage: number;
  allowedMimeTypes: string[];
  quarantineDir: string;
  uploadDir: string;
}

/**
 * File upload request (FormData with these fields)
 */
export interface FileUploadRequest {
  files: File[];
  messageId?: string;
  chatId: string;
}

/**
 * File upload result for a single file
 */
export interface FileUploadResult {
  attachmentId: string;
  messageId: string;
  filename: string;
  secureFilename: string;
  mimeType: string;
  fileSize: number;
  storageUrl?: string;
  thumbnailUrl?: string;
  metadata: Record<string, any>;
  processingStatus: "pending" | "processing" | "completed" | "failed";
  index: number;
}

/**
 * File upload response with results and errors
 */
export interface FileUploadResponse {
  uploads: FileUploadResult[];
  errors: Array<{
    filename: string;
    error: string;
    index: number;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

/**
 * Attachment metadata response
 */
export interface AttachmentResponse {
  id: string;
  messageId: string;
  uploadedBy: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  storageProvider: "local" | "s3" | "gcs" | "azure" | "cloudinary";
  storageKey: string;
  storageUrl?: string;
  metadata: Record<string, any> | null;
  thumbnailUrl?: string;
  previewUrl?: string;
  contentDescription?: string;
  extractedText?: string;
  tags: string[] | null;
  isPublic: boolean;
  accessToken?: string;
  expiresAt?: Date;
  isScanned: boolean;
  scanResult?: "clean" | "infected" | "suspicious" | "pending";
  scanDetails: Record<string, any> | null;
  processingStatus: "pending" | "processing" | "completed" | "failed";
  processingError?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}

// ========================================
// USER MANAGEMENT API TYPES
// ========================================

/**
 * User profile update request schema
 */
export const updateUserProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  website: z.string().url().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  avatar: z.string().url().optional(),
  customStatus: z.string().max(100).optional(),
  // Privacy settings
  isPrivate: z.boolean().optional(),
  allowFriendRequests: z.boolean().optional(),
  allowDirectMessages: z.boolean().optional(),
  showOnlineStatus: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
});

export type UpdateUserProfileRequest = z.infer<typeof updateUserProfileSchema>;

/**
 * User status update request schema
 */
export const updateUserStatusSchema = z.object({
  status: z.enum(["online", "away", "busy", "invisible", "offline"]),
  customStatus: z.string().max(100).optional(),
});

export type UpdateUserStatusRequest = z.infer<typeof updateUserStatusSchema>;

/**
 * User profile response with statistics
 */
export interface UserProfileWithStats {
  profile: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string;
    username?: string;
    displayName?: string;
    bio?: string;
    location?: string;
    website?: string;
    avatar?: string;
    timezone?: string;
    language: string;
    isOnline: boolean;
    lastSeenAt?: Date;
    lastActiveAt?: Date;
    status: "online" | "away" | "busy" | "invisible" | "offline";
    customStatus?: string;
    isActive: boolean;
    isDeleted: boolean;
    deletedAt?: Date;
    isVerified: boolean;
    twoFactorEnabled: boolean;
    isSuspended: boolean;
    suspendedUntil?: Date;
    loginCount: number;
    isPrivate: boolean;
    allowFriendRequests: boolean;
    allowDirectMessages: boolean;
    showOnlineStatus: boolean;
    emailNotifications: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  stats: {
    totalChats: number;
    totalMessages: number;
    friendsCount: number;
    storageUsed: number;
  };
}

/**
 * Public user profile (respecting privacy settings)
 */
export interface PublicUserProfile {
  id: string;
  name: string;
  username?: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  location?: string;
  website?: string;
  status?: "online" | "away" | "busy" | "invisible" | "offline";
  customStatus?: string;
  lastSeenAt?: Date;
  isVerified: boolean;
  createdAt: Date;
}

/**
 * User search response
 */
export interface UserSearchResult {
  profile: PublicUserProfile;
  relationship: Record<string, string>;
  isFriend: boolean;
}

/**
 * User search response with metadata
 */
export interface UserSearchResponse {
  users: UserSearchResult[];
  pagination: PaginationMeta;
  search: SearchMeta;
}

// ========================================
// USER RELATIONSHIP API TYPES
// ========================================

/**
 * Relationship creation request schema
 */
export const createRelationshipSchema = z.object({
  type: z.enum(["friend", "block", "follow", "mute"]),
  requestMessage: z.string().max(500).optional(),
});

export type CreateRelationshipRequest = z.infer<typeof createRelationshipSchema>;

/**
 * Relationship response request schema
 */
export const respondToRelationshipSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export type RespondToRelationshipRequest = z.infer<typeof respondToRelationshipSchema>;

/**
 * User relationship response
 */
export interface UserRelationshipResponse {
  id: string;
  fromUserId: string;
  toUserId: string;
  type: "friend" | "block" | "follow" | "mute";
  status: "pending" | "accepted" | "rejected" | "active" | "inactive";
  requestMessage?: string;
  acceptedAt?: Date;
  lastInteractionAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string;
    username?: string;
    displayName?: string;
    avatar?: string;
    status: "online" | "away" | "busy" | "invisible" | "offline";
    customStatus?: string;
    lastSeenAt?: Date;
    isVerified: boolean;
  };
}

/**
 * Relationships list response
 */
export interface RelationshipsListResponse {
  relationships: UserRelationshipResponse[];
  pagination: PaginationMeta;
}

// ========================================
// WEBSOCKET API TYPES
// ========================================

/**
 * WebSocket message types for type-safe communication
 */
export const WS_MESSAGE_TYPES = {
  // Client to Server
  AUTH: 'auth',
  JOIN_CHAT: 'join_chat',
  LEAVE_CHAT: 'leave_chat',
  SEND_MESSAGE: 'send_message',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  HEARTBEAT: 'heartbeat',
  
  // Server to Client
  AUTH_SUCCESS: 'auth_success',
  AUTH_FAILED: 'auth_failed',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_ERROR: 'message_error',
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  TYPING_UPDATE: 'typing_update',
  CHAT_UPDATED: 'chat_updated',
  ERROR: 'error',
  PONG: 'pong',
} as const;

export type WSMessageType = typeof WS_MESSAGE_TYPES[keyof typeof WS_MESSAGE_TYPES];

/**
 * WebSocket authentication message
 */
export const wsAuthMessageSchema = z.object({
  type: z.literal(WS_MESSAGE_TYPES.AUTH),
  token: z.string(),
  deviceId: z.string(),
});

export type WSAuthMessage = z.infer<typeof wsAuthMessageSchema>;

/**
 * WebSocket join chat message
 */
export const wsJoinChatMessageSchema = z.object({
  type: z.literal(WS_MESSAGE_TYPES.JOIN_CHAT),
  chatId: z.string(),
});

export type WSJoinChatMessage = z.infer<typeof wsJoinChatMessageSchema>;

/**
 * WebSocket leave chat message
 */
export const wsLeaveChatMessageSchema = z.object({
  type: z.literal(WS_MESSAGE_TYPES.LEAVE_CHAT),
  chatId: z.string(),
});

export type WSLeaveChatMessage = z.infer<typeof wsLeaveChatMessageSchema>;

/**
 * WebSocket send message
 */
export const wsSendMessageSchema = z.object({
  type: z.literal(WS_MESSAGE_TYPES.SEND_MESSAGE),
  chatId: z.string(),
  content: z.string().min(1).max(10000),
  messageType: z.enum(["text", "image", "file", "code", "system"]).default("text"),
  metadata: z.record(z.any()).optional(),
  parentMessageId: z.string().optional(),
  tempId: z.string().optional(),
});

export type WSSendMessage = z.infer<typeof wsSendMessageSchema>;

/**
 * WebSocket typing message
 */
export const wsTypingMessageSchema = z.object({
  type: z.enum([WS_MESSAGE_TYPES.TYPING_START, WS_MESSAGE_TYPES.TYPING_STOP]),
  chatId: z.string(),
});

export type WSTypingMessage = z.infer<typeof wsTypingMessageSchema>;

/**
 * WebSocket heartbeat message
 */
export const wsHeartbeatMessageSchema = z.object({
  type: z.literal(WS_MESSAGE_TYPES.HEARTBEAT),
  timestamp: z.number(),
});

export type WSHeartbeatMessage = z.infer<typeof wsHeartbeatMessageSchema>;

/**
 * Union type of all client-to-server WebSocket messages
 */
export type WSClientMessage = 
  | WSAuthMessage
  | WSJoinChatMessage
  | WSLeaveChatMessage
  | WSSendMessage
  | WSTypingMessage
  | WSHeartbeatMessage;

/**
 * WebSocket server response messages
 */
export interface WSAuthSuccessMessage {
  type: typeof WS_MESSAGE_TYPES.AUTH_SUCCESS;
  user: {
    id: string;
    email: string;
    name: string;
  };
  connectionId: string;
  timestamp: string;
}

export interface WSAuthFailedMessage {
  type: typeof WS_MESSAGE_TYPES.AUTH_FAILED;
  error: string;
  code: string;
}

export interface WSMessageReceivedMessage {
  type: typeof WS_MESSAGE_TYPES.MESSAGE_RECEIVED;
  message: {
    id: string;
    chatId: string;
    role: "user" | "assistant" | "system";
    content: string;
    messageType: "text" | "image" | "file" | "code" | "system";
    metadata?: Record<string, any>;
    parentMessageId?: string;
    tokenCount: number;
    createdAt: Date;
    user: {
      id: string;
    };
  };
  timestamp: string;
}

export interface WSMessageSentMessage {
  type: typeof WS_MESSAGE_TYPES.MESSAGE_SENT;
  message: WSMessageReceivedMessage["message"];
  tempId?: string;
  timestamp: string;
}

export interface WSMessageErrorMessage {
  type: typeof WS_MESSAGE_TYPES.MESSAGE_ERROR;
  error: string;
  code: string;
  tempId?: string;
  chatId?: string;
}

export interface WSUserJoinedMessage {
  type: typeof WS_MESSAGE_TYPES.USER_JOINED;
  chatId: string;
  userId: string;
  timestamp: string;
  isOwnJoin?: boolean;
}

export interface WSUserLeftMessage {
  type: typeof WS_MESSAGE_TYPES.USER_LEFT;
  chatId: string;
  userId: string;
  timestamp: string;
}

export interface WSTypingUpdateMessage {
  type: typeof WS_MESSAGE_TYPES.TYPING_UPDATE;
  chatId: string;
  userId: string;
  isTyping: boolean;
  timestamp: string;
}

export interface WSErrorMessage {
  type: typeof WS_MESSAGE_TYPES.ERROR;
  error: string;
  code: string;
}

export interface WSPongMessage {
  type: typeof WS_MESSAGE_TYPES.PONG;
  timestamp: number;
  originalTimestamp: number;
}

/**
 * Union type of all server-to-client WebSocket messages
 */
export type WSServerMessage = 
  | WSAuthSuccessMessage
  | WSAuthFailedMessage
  | WSMessageReceivedMessage
  | WSMessageSentMessage
  | WSMessageErrorMessage
  | WSUserJoinedMessage
  | WSUserLeftMessage
  | WSTypingUpdateMessage
  | WSErrorMessage
  | WSPongMessage;

// ========================================
// ERROR TYPES
// ========================================

/**
 * API error codes for consistent error handling
 */
export enum ApiErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  VIRUS_DETECTED = 'VIRUS_DETECTED',
  SERVER_ERROR = 'SERVER_ERROR',
}

/**
 * Structured API error response
 */
export interface ApiError {
  success: false;
  error: string;
  code?: ApiErrorCode;
  details?: Record<string, any>;
  timestamp?: string;
}

// ========================================
// SYNC API TYPES
// ========================================

/**
 * Sync event types for ElectricSQL integration
 */
export interface SyncEvent {
  id: string;
  entityType: "chat" | "message" | "attachment" | "user" | "relationship";
  entityId: string;
  operation: "create" | "update" | "delete";
  data: string; // JSON string
  timestamp: Date;
  userId: string;
  deviceId: string;
  synced: boolean;
}

/**
 * Sync trigger response
 */
export interface SyncTriggerResponse {
  events: SyncEvent[];
  lastSyncTimestamp: string;
  hasMore: boolean;
}

// ========================================
// UTILITY TYPES
// ========================================

/**
 * Database health check response
 */
export interface DatabaseHealthResponse {
  healthy: boolean;
  timestamp?: Date;
  error?: string;
}

/**
 * API endpoint metadata for documentation
 */
export interface ApiEndpointMeta {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description: string;
  authentication: 'required' | 'optional' | 'none';
  rateLimit?: {
    requests: number;
    window: string;
  };
  requestSchema?: z.ZodSchema;
  responseSchema?: z.ZodSchema;
}

// ========================================
// EXPORT ALL SCHEMAS FOR VALIDATION
// ========================================

export const apiSchemas = {
  // Chat schemas
  createChat: createChatSchema,
  updateChat: updateChatSchema,
  
  // Message schemas
  createMessage: createMessageSchema,
  
  // User schemas
  updateUserProfile: updateUserProfileSchema,
  updateUserStatus: updateUserStatusSchema,
  
  // Relationship schemas
  createRelationship: createRelationshipSchema,
  respondToRelationship: respondToRelationshipSchema,
  
  // WebSocket schemas
  wsAuth: wsAuthMessageSchema,
  wsJoinChat: wsJoinChatMessageSchema,
  wsLeaveChat: wsLeaveChatMessageSchema,
  wsSendMessage: wsSendMessageSchema,
  wsTyping: wsTypingMessageSchema,
  wsHeartbeat: wsHeartbeatMessageSchema,
} as const;

/**
 * Type-safe API client interface (for implementation by client libraries)
 */
export interface ApiClient {
  // Chat operations
  getChats(params?: {
    limit?: number;
    offset?: number;
    archived?: boolean;
    pinned?: boolean;
    search?: string;
    sort?: string;
    order?: string;
  }): Promise<ApiResponse<ChatsListResponse>>;
  
  createChat(data: CreateChatRequest): Promise<ApiResponse<ChatWithMetadata["chat"]>>;
  getChat(id: string): Promise<ApiResponse<ChatWithMetadata>>;
  updateChat(id: string, data: UpdateChatRequest): Promise<ApiResponse<Partial<ChatWithMetadata["chat"]>>>;
  deleteChat(id: string): Promise<ApiResponse<{ id: string; deletedAt: string }>>;
  
  // Message operations
  getChatMessages(chatId: string, params?: {
    limit?: number;
    offset?: number;
    before?: string;
    after?: string;
  }): Promise<ApiResponse<MessagesListResponse>>;
  
  createMessage(chatId: string, data: CreateMessageRequest): Promise<ApiResponse<MessageWithMetadata>>;
  
  // File operations
  uploadFiles(data: FormData): Promise<ApiResponse<FileUploadResponse>>;
  getAttachment(id: string): Promise<ApiResponse<AttachmentResponse>>;
  downloadAttachment(id: string): Promise<Response>;
  deleteAttachment(id: string): Promise<ApiResponse<{ attachmentId: string; messageId: string; deletedAt: string }>>;
  getMessageAttachments(messageId: string): Promise<ApiResponse<{ messageId: string; attachments: AttachmentResponse[] }>>;
  
  // User operations
  getCurrentUser(): Promise<ApiResponse<UserProfileWithStats>>;
  updateCurrentUser(data: UpdateUserProfileRequest): Promise<ApiResponse<{ profile: UserProfileWithStats["profile"]; updatedAt: string }>>;
  getUser(id: string): Promise<ApiResponse<{ profile: PublicUserProfile; relationship: Record<string, string>; isFriend: boolean; canMessage: boolean }>>;
  searchUsers(params: {
    search: string;
    limit?: number;
    offset?: number;
    status?: string;
    verified?: boolean;
  }): Promise<ApiResponse<UserSearchResponse>>;
  updateUserStatus(data: UpdateUserStatusRequest): Promise<ApiResponse<{ status: string; customStatus?: string; updatedAt: string }>>;
  
  // Relationship operations
  getRelationships(params?: {
    type?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<RelationshipsListResponse>>;
  
  createRelationship(userId: string, data: CreateRelationshipRequest): Promise<ApiResponse<UserRelationshipResponse>>;
  respondToRelationship(userId: string, relationshipId: string, data: RespondToRelationshipRequest): Promise<ApiResponse<{ relationshipId: string; status: string; acceptedAt?: string }>>;
  removeRelationship(userId: string, type: string): Promise<ApiResponse<{ removedRelationships: number; type: string; targetUserId: string }>>;
}