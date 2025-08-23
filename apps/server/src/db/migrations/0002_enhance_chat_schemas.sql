-- Enhanced chat database operations and sync functionality
-- Migration: 0002_enhance_chat_schemas.sql
-- Description: Adds enhanced fields to chat and message tables, creates analytics and preferences tables

-- Add new columns to chat table
ALTER TABLE chat ADD COLUMN chat_type TEXT DEFAULT 'conversation' CHECK (chat_type IN ('conversation', 'assistant', 'group', 'system'));
ALTER TABLE chat ADD COLUMN settings TEXT; -- JSON stringified chat settings
ALTER TABLE chat ADD COLUMN tags TEXT; -- JSON array of tags
ALTER TABLE chat ADD COLUMN is_pinned INTEGER DEFAULT 0;
ALTER TABLE chat ADD COLUMN is_archived INTEGER DEFAULT 0;
ALTER TABLE chat ADD COLUMN last_activity_at INTEGER;
ALTER TABLE chat ADD COLUMN message_count INTEGER DEFAULT 0;

-- Add new columns to message table
ALTER TABLE message ADD COLUMN message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'code', 'system'));
ALTER TABLE message ADD COLUMN metadata TEXT; -- JSON stringified metadata (tokens, model info, etc.)
ALTER TABLE message ADD COLUMN parent_message_id TEXT REFERENCES message(id);
ALTER TABLE message ADD COLUMN edit_history TEXT; -- JSON array of previous versions
ALTER TABLE message ADD COLUMN token_count INTEGER DEFAULT 0;

-- Enhance sync_event table with new entity types and operations
-- Note: Since SQLite doesn't support ALTER COLUMN with CHECK constraints on existing tables,
-- we need to recreate the table with the new constraints

-- First, create a temporary backup of existing sync events
CREATE TABLE sync_event_backup AS SELECT * FROM sync_event;

-- Drop the old table
DROP TABLE sync_event;

-- Recreate with enhanced schema
CREATE TABLE sync_event (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'chat', 'message', 'analytics', 'preference')),
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'batch_create', 'batch_update')),
  data TEXT,
  timestamp INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  synced INTEGER DEFAULT 0,
  -- Enhanced sync tracking
  priority INTEGER DEFAULT 1, -- 1=low, 2=normal, 3=high
  retry_count INTEGER DEFAULT 0,
  last_retry_at INTEGER,
  error_message TEXT
);

-- Restore data from backup
INSERT INTO sync_event (id, entity_type, entity_id, operation, data, timestamp, user_id, device_id, synced)
SELECT id, entity_type, entity_id, operation, data, timestamp, user_id, device_id, synced FROM sync_event_backup;

-- Drop backup table
DROP TABLE sync_event_backup;

-- Create chat analytics table
CREATE TABLE IF NOT EXISTS chat_analytics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chat_id TEXT,
  -- Analytics metrics
  total_messages INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  avg_response_time INTEGER DEFAULT 0, -- milliseconds
  total_characters INTEGER DEFAULT 0,
  sessions_count INTEGER DEFAULT 0,
  last_used_at INTEGER,
  -- Time-based analytics
  daily_usage TEXT, -- JSON object tracking daily usage patterns
  weekly_usage TEXT, -- JSON object tracking weekly usage patterns
  monthly_usage TEXT, -- JSON object tracking monthly usage patterns
  -- Performance metrics
  error_count INTEGER DEFAULT 0,
  successful_responses INTEGER DEFAULT 0,
  avg_tokens_per_message INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id),
  FOREIGN KEY (chat_id) REFERENCES chat(id)
);

-- Create user preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  -- UI/UX preferences
  theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  language TEXT DEFAULT 'en',
  font_size TEXT DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large')),
  compact_mode INTEGER DEFAULT 0,
  -- Chat preferences
  default_chat_type TEXT DEFAULT 'conversation' CHECK (default_chat_type IN ('conversation', 'assistant', 'group', 'system')),
  auto_save_chats INTEGER DEFAULT 1,
  show_timestamps INTEGER DEFAULT 1,
  enable_notifications INTEGER DEFAULT 1,
  -- AI behavior preferences
  default_model TEXT DEFAULT 'gpt-4',
  temperature INTEGER DEFAULT 70, -- 0-100 scale
  max_tokens INTEGER DEFAULT 2048,
  context_window INTEGER DEFAULT 8192,
  -- Privacy and data preferences
  allow_analytics INTEGER DEFAULT 1,
  allow_data_sharing INTEGER DEFAULT 0,
  retention_period INTEGER DEFAULT 365, -- days
  -- Export/import preferences
  export_format TEXT DEFAULT 'json' CHECK (export_format IN ('json', 'markdown', 'txt')),
  include_metadata INTEGER DEFAULT 1,
  -- Custom preferences (JSON for extensibility)
  custom_settings TEXT, -- JSON object for additional user-defined preferences
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id)
);

-- Create enhanced indexes for better performance

-- Chat table indexes
CREATE INDEX IF NOT EXISTS idx_chat_user_id ON chat(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_updated_at ON chat(updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_last_activity ON chat(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_chat_type ON chat(chat_type);
CREATE INDEX IF NOT EXISTS idx_chat_pinned ON chat(is_pinned);
CREATE INDEX IF NOT EXISTS idx_chat_archived ON chat(is_archived);
CREATE INDEX IF NOT EXISTS idx_chat_deleted ON chat(is_deleted);

-- Message table indexes
CREATE INDEX IF NOT EXISTS idx_message_chat_id ON message(chat_id);
CREATE INDEX IF NOT EXISTS idx_message_created_at ON message(created_at);
CREATE INDEX IF NOT EXISTS idx_message_type ON message(message_type);
CREATE INDEX IF NOT EXISTS idx_message_parent ON message(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_message_deleted ON message(is_deleted);
CREATE INDEX IF NOT EXISTS idx_message_token_count ON message(token_count);

-- Sync event table indexes
CREATE INDEX IF NOT EXISTS idx_sync_event_synced ON sync_event(synced);
CREATE INDEX IF NOT EXISTS idx_sync_event_user_id ON sync_event(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_event_timestamp ON sync_event(timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_event_entity ON sync_event(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_event_priority ON sync_event(priority);
CREATE INDEX IF NOT EXISTS idx_sync_event_retry ON sync_event(retry_count);

-- Device table indexes
CREATE INDEX IF NOT EXISTS idx_device_user_id ON device(user_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprint ON device(fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_last_sync ON device(last_sync_at);

-- Chat analytics table indexes
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON chat_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_chat_id ON chat_analytics(chat_id);
CREATE INDEX IF NOT EXISTS idx_analytics_last_used ON chat_analytics(last_used_at);
CREATE INDEX IF NOT EXISTS idx_analytics_updated ON chat_analytics(updated_at);

-- User preferences table indexes
CREATE INDEX IF NOT EXISTS idx_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_preferences_theme ON user_preferences(theme);
CREATE INDEX IF NOT EXISTS idx_preferences_updated ON user_preferences(updated_at);

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_chat_user_activity ON chat(user_id, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_message_chat_created ON message(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_event_user_unsynced ON sync_event(user_id, synced, timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_user_chat ON chat_analytics(user_id, chat_id);

-- Update existing chats to set default values for new columns
UPDATE chat SET 
  chat_type = 'conversation',
  is_pinned = 0,
  is_archived = 0,
  message_count = (SELECT COUNT(*) FROM message WHERE message.chat_id = chat.id AND message.is_deleted = 0),
  last_activity_at = (SELECT MAX(message.created_at) FROM message WHERE message.chat_id = chat.id AND message.is_deleted = 0)
WHERE chat_type IS NULL;

-- Update existing messages to set default values for new columns
UPDATE message SET 
  message_type = 'text',
  token_count = 0
WHERE message_type IS NULL;