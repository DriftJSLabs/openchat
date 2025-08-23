import { createMigration } from './migration-manager';

/**
 * Migration 002: Enhanced Chat Features
 * 
 * Adds advanced chat functionality including message types, metadata, 
 * chat categorization, analytics, and user preferences. This migration
 * extends the basic schema with comprehensive features for a production
 * chat application.
 */

export const migration002 = createMigration({
  version: '002',
  description: 'Add enhanced chat features and analytics',
  dependencies: ['001'],
  up: [
    // Enhance chat table with advanced fields
    `ALTER TABLE chat ADD COLUMN chat_type TEXT DEFAULT 'conversation' 
     CHECK (chat_type IN ('conversation', 'assistant', 'group', 'system'))`,
    `ALTER TABLE chat ADD COLUMN settings TEXT`,
    `ALTER TABLE chat ADD COLUMN tags TEXT`,
    `ALTER TABLE chat ADD COLUMN is_pinned INTEGER DEFAULT 0`,
    `ALTER TABLE chat ADD COLUMN is_archived INTEGER DEFAULT 0`,
    `ALTER TABLE chat ADD COLUMN last_activity_at INTEGER`,
    `ALTER TABLE chat ADD COLUMN message_count INTEGER DEFAULT 0`,
    
    // Enhance message table with advanced fields
    `ALTER TABLE message ADD COLUMN message_type TEXT DEFAULT 'text' 
     CHECK (message_type IN ('text', 'image', 'file', 'code', 'system'))`,
    `ALTER TABLE message ADD COLUMN metadata TEXT`,
    `ALTER TABLE message ADD COLUMN parent_message_id TEXT REFERENCES message(id)`,
    `ALTER TABLE message ADD COLUMN edit_history TEXT`,
    `ALTER TABLE message ADD COLUMN token_count INTEGER DEFAULT 0`,
    
    // Enhance sync_event table with priority and retry logic
    `ALTER TABLE sync_event ADD COLUMN priority INTEGER DEFAULT 1`,
    `ALTER TABLE sync_event ADD COLUMN retry_count INTEGER DEFAULT 0`,
    `ALTER TABLE sync_event ADD COLUMN last_retry_at INTEGER`,
    `ALTER TABLE sync_event ADD COLUMN error_message TEXT`,
    
    // Create chat analytics table
    `CREATE TABLE IF NOT EXISTS chat_analytics (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      chat_id TEXT REFERENCES chat(id),
      total_messages INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      avg_response_time INTEGER DEFAULT 0,
      total_characters INTEGER DEFAULT 0,
      sessions_count INTEGER DEFAULT 0,
      last_used_at INTEGER,
      daily_usage TEXT,
      weekly_usage TEXT,
      monthly_usage TEXT,
      error_count INTEGER DEFAULT 0,
      successful_responses INTEGER DEFAULT 0,
      avg_tokens_per_message INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    
    // Create user preferences table
    `CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
      language TEXT DEFAULT 'en',
      font_size TEXT DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large')),
      compact_mode INTEGER DEFAULT 0,
      default_chat_type TEXT DEFAULT 'conversation' CHECK (default_chat_type IN ('conversation', 'assistant', 'group', 'system')),
      auto_save_chats INTEGER DEFAULT 1,
      show_timestamps INTEGER DEFAULT 1,
      enable_notifications INTEGER DEFAULT 1,
      default_model TEXT DEFAULT 'gpt-4',
      temperature INTEGER DEFAULT 70,
      max_tokens INTEGER DEFAULT 2048,
      context_window INTEGER DEFAULT 8192,
      allow_analytics INTEGER DEFAULT 1,
      allow_data_sharing INTEGER DEFAULT 0,
      retention_period INTEGER DEFAULT 365,
      export_format TEXT DEFAULT 'json' CHECK (export_format IN ('json', 'markdown', 'txt')),
      include_metadata INTEGER DEFAULT 1,
      custom_settings TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    
    // Add new indexes for enhanced features
    `CREATE INDEX IF NOT EXISTS idx_chat_type ON chat(chat_type)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_is_pinned ON chat(is_pinned)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_last_activity ON chat(last_activity_at)`,
    `CREATE INDEX IF NOT EXISTS idx_message_type ON message(message_type)`,
    `CREATE INDEX IF NOT EXISTS idx_message_parent_id ON message(parent_message_id)`,
    `CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON chat_analytics(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_analytics_chat_id ON chat_analytics(chat_id)`,
    `CREATE INDEX IF NOT EXISTS idx_preferences_user_id ON user_preferences(user_id)`,
  ],
  down: [
    // Drop new indexes
    'DROP INDEX IF EXISTS idx_preferences_user_id',
    'DROP INDEX IF EXISTS idx_analytics_chat_id',
    'DROP INDEX IF EXISTS idx_analytics_user_id',
    'DROP INDEX IF EXISTS idx_message_parent_id',
    'DROP INDEX IF EXISTS idx_message_type',
    'DROP INDEX IF EXISTS idx_chat_last_activity',
    'DROP INDEX IF EXISTS idx_chat_is_pinned',
    'DROP INDEX IF EXISTS idx_chat_type',
    
    // Drop new tables
    'DROP TABLE IF EXISTS user_preferences',
    'DROP TABLE IF EXISTS chat_analytics',
    
    // Note: SQLite doesn't support DROP COLUMN, so we'd need to recreate tables
    // For this example, we'll use a comment to indicate the limitation
    `-- SQLite limitation: Cannot drop columns directly
     -- To properly rollback, would need to recreate tables without new columns
     -- This is a simplified rollback that leaves the columns in place`,
  ]
});