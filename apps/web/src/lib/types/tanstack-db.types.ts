/**
 * Comprehensive TypeScript types for TanStack DB operations in OpenChat
 * This file provides type definitions for all database operations, sync states,
 * error handling, and real-time functionality integrations.
 */

import type {
  Chat,
  Message,
  User,
  SyncEvent,
  Device,
  SyncConfig,
  ChatAnalytics,
  UserPreferences,
  InsertChat,
  InsertMessage,
  InsertUser,
  InsertSyncEvent,
  InsertDevice,
  InsertSyncConfig,
  InsertChatAnalytics,
  InsertUserPreferences
} from '@/lib/db/schema/shared';

import { 
  DatabaseConnectionStatus, 
  SyncStatus, 
  MessageQueuePriority,
  SyncOperation,
  EntityType 
} from '@/lib/tanstack-db';

/**
 * Core database operation types
 */

/** 
 * Generic database query result wrapper
 * Provides consistent error handling and loading states for all operations
 */
export interface QueryResult<T> {
  /** Query result data, null when loading or on error */
  data: T | null;
  /** Loading state indicator */
  isLoading: boolean;
  /** Error information if query failed */
  error: Error | null;
  /** Whether data is currently being refetched */
  isRefetching: boolean;
  /** Manual refetch function */
  refetch: () => Promise<void>;
}

/**
 * Live query result with real-time updates
 * Extends QueryResult with subscription management
 */
export interface LiveQueryResult<T> extends QueryResult<T> {
  /** Whether the query is subscribed to real-time updates */
  isSubscribed: boolean;
  /** Function to manually subscribe/unsubscribe from updates */
  toggleSubscription: (subscribe: boolean) => void;
  /** Last update timestamp */
  lastUpdate: Date | null;
  /** Connection status to the sync service */
  connectionStatus: DatabaseConnectionStatus;
}

/**
 * Mutation result wrapper for create/update/delete operations
 */
export interface MutationResult<TData = unknown, TVariables = unknown> {
  /** The mutation function to execute */
  mutate: (variables: TVariables) => Promise<TData>;
  /** Current mutation state */
  data: TData | null;
  /** Error from the last mutation */
  error: Error | null;
  /** Whether a mutation is currently executing */
  isLoading: boolean;
  /** Whether the mutation was successful */
  isSuccess: boolean;
  /** Whether the mutation failed */
  isError: boolean;
  /** Reset the mutation state */
  reset: () => void;
}

/**
 * Optimistic update configuration
 */
export interface OptimisticUpdate<T> {
  /** Temporary ID for optimistic updates */
  tempId: string;
  /** The optimistic data to display immediately */
  optimisticData: T;
  /** Rollback function called if the update fails */
  rollback: () => void;
  /** Timestamp when the optimistic update was created */
  createdAt: Date;
}

/**
 * Chat-specific types and operations
 */

/**
 * Extended chat type with computed properties and UI state
 */
export interface ChatWithMetadata extends Chat {
  /** Number of unread messages (computed) */
  unreadCount?: number;
  /** Last message preview (computed) */
  lastMessage?: Message;
  /** Whether this chat has pending sync operations */
  hasPendingSync?: boolean;
  /** UI-specific loading states */
  isLoading?: boolean;
  /** Whether this chat is currently selected */
  isSelected?: boolean;
}

/**
 * Message with extended metadata for UI rendering
 */
export interface MessageWithMetadata extends Message {
  /** Whether this message is currently being edited */
  isEditing?: boolean;
  /** Whether this message is in an optimistic state */
  isOptimistic?: boolean;
  /** Error state for failed messages */
  error?: string;
  /** Retry count for failed sends */
  retryCount?: number;
  /** Child messages for threading support */
  children?: MessageWithMetadata[];
  /** Parent message for threading context */
  parent?: MessageWithMetadata;
}

/**
 * Chat creation parameters with validation
 */
export interface CreateChatParams {
  /** Chat title */
  title: string;
  /** Chat type (conversation, assistant, group, system) */
  chatType?: Chat['chatType'];
  /** Initial message content (optional) */
  initialMessage?: string;
  /** Chat settings as JSON string */
  settings?: string;
  /** Chat tags for organization */
  tags?: string[];
  /** Whether to pin the chat immediately */
  isPinned?: boolean;
}

/**
 * Message creation parameters with rich content support
 */
export interface CreateMessageParams {
  /** Target chat ID */
  chatId: string;
  /** Message content */
  content: string;
  /** Message role (user, assistant, system) */
  role: Message['role'];
  /** Message type (text, image, file, code, system) */
  messageType?: Message['messageType'];
  /** Additional metadata as JSON string */
  metadata?: string;
  /** Parent message ID for threading */
  parentMessageId?: string;
  /** Token count estimation */
  tokenCount?: number;
}

/**
 * Message update parameters for editing
 */
export interface UpdateMessageParams {
  /** Message ID to update */
  messageId: string;
  /** New content */
  content: string;
  /** Updated metadata */
  metadata?: string;
  /** Whether to track in edit history */
  trackHistory?: boolean;
}

/**
 * Pagination and infinite scroll types
 */

/**
 * Pagination parameters for message queries
 */
export interface MessagePaginationParams {
  /** Chat ID to paginate messages for */
  chatId: string;
  /** Number of messages per page */
  limit: number;
  /** Cursor for pagination (message ID or timestamp) */
  cursor?: string;
  /** Direction to paginate (before/after cursor) */
  direction?: 'before' | 'after';
  /** Whether to include deleted messages */
  includeDeleted?: boolean;
}

/**
 * Pagination result with cursor information
 */
export interface PaginatedResult<T> {
  /** Array of items for the current page */
  data: T[];
  /** Whether there are more items to load */
  hasMore: boolean;
  /** Cursor for the next page */
  nextCursor: string | null;
  /** Cursor for the previous page */
  prevCursor: string | null;
  /** Total count (if available) */
  totalCount?: number;
}

/**
 * Infinite scroll state management
 */
export interface InfiniteScrollState<T> {
  /** All loaded pages */
  pages: PaginatedResult<T>[];
  /** Combined data from all pages */
  allData: T[];
  /** Whether more data can be loaded */
  hasNextPage: boolean;
  /** Whether data is currently being loaded */
  isFetchingNextPage: boolean;
  /** Function to load the next page */
  fetchNextPage: () => Promise<void>;
  /** Function to refresh all data */
  refresh: () => Promise<void>;
}

/**
 * Sync and offline support types
 */

/**
 * Sync state for an individual entity
 */
export interface EntitySyncState {
  /** Entity ID */
  entityId: string;
  /** Entity type */
  entityType: EntityType;
  /** Current sync status */
  status: SyncStatus;
  /** Last successful sync timestamp */
  lastSyncAt: Date | null;
  /** Number of sync attempts */
  attempts: number;
  /** Last error message */
  error: string | null;
  /** Whether entity has local changes pending sync */
  hasPendingChanges: boolean;
}

/**
 * Global sync status information
 */
export interface GlobalSyncState {
  /** Overall sync status */
  status: SyncStatus;
  /** Database connection status */
  connectionStatus: DatabaseConnectionStatus;
  /** Number of pending sync operations */
  pendingOperations: number;
  /** Last successful sync timestamp */
  lastSyncAt: Date | null;
  /** Current sync error (if any) */
  error: string | null;
  /** Estimated time until next sync attempt */
  nextSyncIn: number | null;
  /** Whether offline mode is active */
  isOffline: boolean;
}

/**
 * Offline queue item for pending operations
 */
export interface OfflineQueueItem {
  /** Unique queue item ID */
  id: string;
  /** Operation type */
  operation: SyncOperation;
  /** Entity type being operated on */
  entityType: EntityType;
  /** Entity ID (for updates/deletes) */
  entityId?: string;
  /** Operation data */
  data: Record<string, unknown>;
  /** Queue priority */
  priority: MessageQueuePriority;
  /** Number of retry attempts */
  retries: number;
  /** Timestamp when added to queue */
  createdAt: Date;
  /** Last attempt timestamp */
  lastAttempt: Date | null;
  /** Error from last attempt */
  error: string | null;
}

/**
 * Conflict resolution types
 */

/**
 * Data conflict information
 */
export interface DataConflict<T = unknown> {
  /** Conflict unique ID */
  conflictId: string;
  /** Entity type in conflict */
  entityType: EntityType;
  /** Entity ID in conflict */
  entityId: string;
  /** Local version of the data */
  localVersion: T;
  /** Remote version of the data */
  remoteVersion: T;
  /** Conflicting field names */
  conflictingFields: string[];
  /** Conflict detection timestamp */
  detectedAt: Date;
  /** Resolution strategy */
  resolutionStrategy?: ConflictResolutionStrategy;
}

/**
 * Conflict resolution strategies
 */
export enum ConflictResolutionStrategy {
  /** Use local version */
  LOCAL_WINS = 'local_wins',
  /** Use remote version */
  REMOTE_WINS = 'remote_wins',
  /** Merge both versions */
  MERGE = 'merge',
  /** Ask user to resolve */
  MANUAL = 'manual',
  /** Use latest timestamp */
  LAST_WRITE_WINS = 'last_write_wins'
}

/**
 * Conflict resolution result
 */
export interface ConflictResolution<T = unknown> {
  /** The resolved data */
  resolvedData: T;
  /** Strategy used for resolution */
  strategy: ConflictResolutionStrategy;
  /** Additional resolution metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error handling types
 */

/**
 * Database operation error with context
 */
export interface DatabaseError extends Error {
  /** Error code for programmatic handling */
  code: string;
  /** Error category */
  category: 'network' | 'validation' | 'conflict' | 'permission' | 'unknown';
  /** Entity information if applicable */
  entityInfo?: {
    entityType: EntityType;
    entityId?: string;
  };
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Suggested retry delay in milliseconds */
  retryDelay?: number;
  /** Additional error context */
  context?: Record<string, unknown>;
}

/**
 * Error recovery options
 */
export interface ErrorRecoveryOptions {
  /** Whether to show user notification */
  showNotification: boolean;
  /** Whether to attempt automatic retry */
  autoRetry: boolean;
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Exponential backoff base delay */
  baseRetryDelay: number;
  /** Custom error message for users */
  userMessage?: string;
}

/**
 * Hook options and configurations
 */

/**
 * Configuration for chat hooks
 */
export interface ChatHookOptions {
  /** Whether to enable real-time updates */
  realTime?: boolean;
  /** Whether to include archived chats */
  includeArchived?: boolean;
  /** Whether to include deleted chats */
  includeDeleted?: boolean;
  /** Polling interval for non-real-time updates */
  pollingInterval?: number;
  /** Whether to enable optimistic updates */
  optimistic?: boolean;
}

/**
 * Configuration for message hooks
 */
export interface MessageHookOptions extends ChatHookOptions {
  /** Number of messages to load initially */
  initialLimit?: number;
  /** Whether to enable infinite scroll */
  infiniteScroll?: boolean;
  /** Message order (ascending/descending by timestamp) */
  order?: 'asc' | 'desc';
  /** Whether to include message metadata */
  includeMetadata?: boolean;
}

/**
 * Configuration for sync hooks
 */
export interface SyncHookOptions {
  /** Whether to auto-connect on mount */
  autoConnect?: boolean;
  /** Custom sync interval in milliseconds */
  syncInterval?: number;
  /** Whether to sync in background */
  backgroundSync?: boolean;
  /** Priority for sync operations */
  priority?: MessageQueuePriority;
}

/**
 * Export all types for easy importing
 */
export type {
  Chat,
  Message,
  User,
  SyncEvent,
  Device,
  SyncConfig,
  ChatAnalytics,
  UserPreferences,
  InsertChat,
  InsertMessage,
  InsertUser,
  InsertSyncEvent,
  InsertDevice,
  InsertSyncConfig,
  InsertChatAnalytics,
  InsertUserPreferences
};