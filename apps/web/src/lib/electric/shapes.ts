import type { ShapeStreamOptions } from '@electric-sql/client';

/**
 * ElectricSQL Shape Definitions for OpenChat Application
 * 
 * This module provides comprehensive shape definitions for selective data synchronization.
 * Shapes define what data to sync, how to filter it, and what columns to include.
 * 
 * Key benefits:
 * - Reduces bandwidth by syncing only necessary data
 * - Provides user-specific data filtering
 * - Supports real-time updates with minimal overhead
 * - Enables offline-first functionality with selective sync
 */

/**
 * Base shape configuration that includes common settings
 */
const baseShapeConfig = {
  url: process.env.NEXT_PUBLIC_ELECTRIC_URL || 'http://localhost:5133',
  apiKey: process.env.NEXT_PUBLIC_ELECTRIC_API_KEY,
} as const;

/**
 * User-specific chat shape for syncing only chats belonging to a specific user
 * Includes advanced filtering for active, non-deleted chats with proper ordering
 */
export const createUserChatShape = (userId: string): ShapeStreamOptions => ({
  ...baseShapeConfig,
  table: 'chat',
  // Only sync non-deleted chats for the specific user, ordered by last activity
  where: `user_id = '${userId}' AND is_deleted = false`,
  // Include all necessary columns for comprehensive chat functionality
  columns: [
    'id',
    'title', 
    'user_id',
    'chat_type',
    'settings',
    'tags',
    'is_pinned',
    'is_archived',
    'last_activity_at',
    'message_count',
    'created_at',
    'updated_at'
  ],
  // Order by last activity to prioritize recently used chats
  orderBy: 'last_activity_at DESC',
  // Limit to prevent syncing too many chats at once (can be adjusted based on needs)
  limit: 1000,
});

/**
 * Message shape for a specific chat with comprehensive message data
 * Optimized for real-time chat functionality and message threading
 */
export const createChatMessageShape = (chatId: string): ShapeStreamOptions => ({
  ...baseShapeConfig,
  table: 'message',
  // Only sync messages for the specific chat that aren't deleted
  where: `chat_id = '${chatId}' AND is_deleted = false`,
  // Include all message fields for rich messaging functionality
  columns: [
    'id',
    'chat_id',
    'role',
    'content',
    'message_type',
    'metadata',
    'parent_message_id',
    'edit_history',
    'token_count',
    'created_at'
  ],
  // Order chronologically for proper message display
  orderBy: 'created_at ASC',
  // No limit on messages per chat to ensure complete conversation history
});

/**
 * User shape for syncing user profile and authentication data
 * Minimal data sync focused on essential user information
 */
export const createUserShape = (userId: string): ShapeStreamOptions => ({
  ...baseShapeConfig,
  table: 'user',
  where: `id = '${userId}'`,
  columns: [
    'id',
    'name',
    'email',
    'email_verified',
    'image',
    'created_at',
    'updated_at'
  ],
});

/**
 * User preferences shape for syncing user settings across devices
 * Essential for maintaining consistent user experience across sessions
 */
export const createUserPreferencesShape = (userId: string): ShapeStreamOptions => ({
  ...baseShapeConfig,
  table: 'user_preferences',
  where: `user_id = '${userId}'`,
  columns: [
    'id',
    'user_id',
    'theme',
    'language',
    'font_size',
    'compact_mode',
    'default_chat_type',
    'auto_save_chats',
    'show_timestamps',
    'enable_notifications',
    'default_model',
    'temperature',
    'max_tokens',
    'context_window',
    'allow_analytics',
    'allow_data_sharing',
    'retention_period',
    'export_format',
    'include_metadata',
    'custom_settings',
    'created_at',
    'updated_at'
  ],
});

/**
 * Chat analytics shape for performance monitoring and usage insights
 * Filtered by user to maintain privacy and relevance
 */
export const createUserAnalyticsShape = (userId: string): ShapeStreamOptions => ({
  ...baseShapeConfig,
  table: 'chat_analytics',
  where: `user_id = '${userId}'`,
  columns: [
    'id',
    'user_id',
    'chat_id',
    'total_messages',
    'total_tokens',
    'avg_response_time',
    'total_characters',
    'sessions_count',
    'last_used_at',
    'daily_usage',
    'weekly_usage',
    'monthly_usage',
    'error_count',
    'successful_responses',
    'avg_tokens_per_message',
    'created_at',
    'updated_at'
  ],
  // Order by last used to prioritize active chats in analytics
  orderBy: 'last_used_at DESC',
});

/**
 * Sync configuration shape for managing user-specific sync settings
 */
export const createSyncConfigShape = (userId: string): ShapeStreamOptions => ({
  ...baseShapeConfig,
  table: 'sync_config',
  where: `user_id = '${userId}'`,
  columns: [
    'id',
    'user_id',
    'mode',
    'auto_sync',
    'sync_interval',
    'updated_at'
  ],
});

/**
 * Device tracking shape for multi-device sync management
 */
export const createUserDevicesShape = (userId: string): ShapeStreamOptions => ({
  ...baseShapeConfig,
  table: 'device',
  where: `user_id = '${userId}'`,
  columns: [
    'id',
    'user_id',
    'fingerprint',
    'last_sync_at',
    'created_at'
  ],
  // Order by last sync to show most recently active devices first
  orderBy: 'last_sync_at DESC',
});

/**
 * Recent messages shape for quickly loading the most recent messages across all user chats
 * Useful for chat previews and recent activity displays
 */
export const createRecentMessagesShape = (userId: string, limit: number = 50): ShapeStreamOptions => ({
  ...baseShapeConfig,
  table: 'message',
  // Join with chat table to filter by user_id (this might need adjustment based on ElectricSQL capabilities)
  where: `chat_id IN (SELECT id FROM chat WHERE user_id = '${userId}' AND is_deleted = false) AND is_deleted = false`,
  columns: [
    'id',
    'chat_id',
    'role',
    'content',
    'message_type',
    'created_at'
  ],
  orderBy: 'created_at DESC',
  limit,
});

/**
 * Active chats shape for syncing only pinned or recently used chats
 * Optimized for users with many chats who want priority sync
 */
export const createActiveChatsShape = (userId: string, daysBack: number = 7): ShapeStreamOptions => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffTimestamp = cutoffDate.toISOString();

  return {
    ...baseShapeConfig,
    table: 'chat',
    where: `user_id = '${userId}' AND is_deleted = false AND (is_pinned = true OR last_activity_at > '${cutoffTimestamp}')`,
    columns: [
      'id',
      'title',
      'user_id',
      'chat_type',
      'settings',
      'tags',
      'is_pinned',
      'is_archived',
      'last_activity_at',
      'message_count',
      'created_at',
      'updated_at'
    ],
    orderBy: 'CASE WHEN is_pinned THEN 0 ELSE 1 END, last_activity_at DESC',
    limit: 100,
  };
};

/**
 * Archived chats shape for managing archived conversations
 * Separate shape to avoid cluttering main chat sync
 */
export const createArchivedChatsShape = (userId: string): ShapeStreamOptions => ({
  ...baseShapeConfig,
  table: 'chat',
  where: `user_id = '${userId}' AND is_archived = true AND is_deleted = false`,
  columns: [
    'id',
    'title',
    'user_id',
    'chat_type',
    'is_archived',
    'last_activity_at',
    'message_count',
    'created_at',
    'updated_at'
  ],
  orderBy: 'updated_at DESC',
});

/**
 * AI usage tracking shape for monitoring API usage and costs
 * Important for usage analytics and billing management
 */
export const createAIUsageShape = (userId: string, daysBack: number = 30): ShapeStreamOptions => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffTimestamp = cutoffDate.toISOString();

  return {
    ...baseShapeConfig,
    table: 'ai_usage',
    where: `user_id = '${userId}' AND created_at > '${cutoffTimestamp}'`,
    columns: [
      'id',
      'user_id',
      'chat_id',
      'message_id',
      'operation',
      'model',
      'provider',
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'cost',
      'latency',
      'status',
      'error_message',
      'finish_reason',
      'quality_score',
      'user_feedback',
      'created_at',
      'completed_at'
    ],
    orderBy: 'created_at DESC',
    limit: 1000,
  };
};

/**
 * Shape definition registry for easy access to all shapes
 */
export const shapeDefinitions = {
  userChats: createUserChatShape,
  chatMessages: createChatMessageShape,
  user: createUserShape,
  userPreferences: createUserPreferencesShape,
  userAnalytics: createUserAnalyticsShape,
  syncConfig: createSyncConfigShape,
  userDevices: createUserDevicesShape,
  recentMessages: createRecentMessagesShape,
  activeChats: createActiveChatsShape,
  archivedChats: createArchivedChatsShape,
  aiUsage: createAIUsageShape,
} as const;

/**
 * Type definitions for shape functions
 */
export type ShapeDefinition = typeof shapeDefinitions;
export type ShapeName = keyof ShapeDefinition;

/**
 * Helper function to validate shape parameters before creation
 */
export function validateShapeParams(userId: string, shapeName: ShapeName): boolean {
  // Validate userId format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(userId)) {
    console.error(`Invalid userId format for shape ${shapeName}:`, userId);
    return false;
  }

  // Additional validation can be added here for specific shapes
  return true;
}

/**
 * Utility function to create multiple shapes for a user
 */
export function createUserShapeBundle(userId: string): Record<string, ShapeStreamOptions> {
  if (!validateShapeParams(userId, 'user')) {
    throw new Error('Invalid user ID for shape creation');
  }

  return {
    user: createUserShape(userId),
    chats: createUserChatShape(userId),
    preferences: createUserPreferencesShape(userId),
    analytics: createUserAnalyticsShape(userId),
    syncConfig: createSyncConfigShape(userId),
    devices: createUserDevicesShape(userId),
    recentMessages: createRecentMessagesShape(userId),
    activeChats: createActiveChatsShape(userId),
  };
}

/**
 * Configuration for shape subscriptions with error handling and retry logic
 */
export interface ShapeSubscriptionConfig {
  maxRetries: number;
  retryDelay: number;
  onError?: (error: Error, shapeName: string) => void;
  onReconnect?: (shapeName: string) => void;
}

export const defaultSubscriptionConfig: ShapeSubscriptionConfig = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  onError: (error, shapeName) => {
    console.error(`Shape subscription error for ${shapeName}:`, error);
  },
  onReconnect: (shapeName) => {
    console.log(`Shape subscription reconnected for ${shapeName}`);
  },
};