import { createMigration } from './migration-manager';

/**
 * Migration 003: Advanced Messaging Features
 * 
 * Introduces sophisticated messaging capabilities including message versioning,
 * file attachments, reactions, conversation branching, and enhanced chat settings.
 * This migration enables advanced collaboration and interaction features.
 */

export const migration003 = createMigration({
  version: '003',
  description: 'Add advanced messaging features with versioning and attachments',
  dependencies: ['002'],
  up: [
    // Message versioning for edit history
    `CREATE TABLE IF NOT EXISTS message_version (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES message(id),
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      edited_at INTEGER NOT NULL,
      edited_by TEXT NOT NULL REFERENCES user(id),
      edit_reason TEXT,
      metadata TEXT,
      is_active INTEGER DEFAULT 1
    )`,
    
    // File attachments for messages
    `CREATE TABLE IF NOT EXISTS message_attachment (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES message(id),
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_path TEXT,
      file_url TEXT,
      thumbnail_path TEXT,
      upload_status TEXT DEFAULT 'pending' CHECK (upload_status IN ('pending', 'uploading', 'completed', 'failed', 'cancelled')),
      upload_progress INTEGER DEFAULT 0,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    
    // Message reactions
    `CREATE TABLE IF NOT EXISTS message_reaction (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES message(id),
      user_id TEXT NOT NULL REFERENCES user(id),
      reaction_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(message_id, user_id, reaction_type)
    )`,
    
    // Chat participants for group functionality
    `CREATE TABLE IF NOT EXISTS chat_participant (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chat(id),
      user_id TEXT NOT NULL REFERENCES user(id),
      role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
      joined_at INTEGER NOT NULL,
      left_at INTEGER,
      invited_by TEXT REFERENCES user(id),
      permissions TEXT,
      is_active INTEGER DEFAULT 1,
      UNIQUE(chat_id, user_id)
    )`,
    
    // Chat templates for reusable conversations
    `CREATE TABLE IF NOT EXISTS chat_template (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      is_public INTEGER DEFAULT 0,
      is_system INTEGER DEFAULT 0,
      prompt_template TEXT NOT NULL,
      variables TEXT,
      tags TEXT,
      use_count INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      rating_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    
    // Advanced chat settings
    `CREATE TABLE IF NOT EXISTS chat_settings (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chat(id),
      model_provider TEXT DEFAULT 'openai',
      model_name TEXT DEFAULT 'gpt-4',
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      top_p REAL DEFAULT 1.0,
      frequency_penalty REAL DEFAULT 0.0,
      presence_penalty REAL DEFAULT 0.0,
      system_prompt TEXT,
      auto_title INTEGER DEFAULT 1,
      auto_save INTEGER DEFAULT 1,
      enable_typing INTEGER DEFAULT 1,
      enable_read_receipts INTEGER DEFAULT 1,
      context_window INTEGER DEFAULT 8192,
      memory_enabled INTEGER DEFAULT 1,
      memory_strategy TEXT DEFAULT 'sliding_window' CHECK (memory_strategy IN ('full', 'summarize', 'sliding_window', 'semantic')),
      is_private INTEGER DEFAULT 1,
      allow_sharing INTEGER DEFAULT 0,
      share_token TEXT,
      share_expiry INTEGER,
      custom_instructions TEXT,
      response_format TEXT DEFAULT 'default' CHECK (response_format IN ('default', 'code', 'markdown', 'json', 'structured')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(chat_id)
    )`,
    
    // Conversation branches for exploring different paths
    `CREATE TABLE IF NOT EXISTS conversation_branch (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chat(id),
      parent_message_id TEXT REFERENCES message(id),
      branch_name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    
    // Enhance message table with new fields
    `ALTER TABLE message ADD COLUMN branch_id TEXT REFERENCES conversation_branch(id)`,
    `ALTER TABLE message ADD COLUMN original_content TEXT`,
    `ALTER TABLE message ADD COLUMN quality_score REAL`,
    `ALTER TABLE message ADD COLUMN user_rating INTEGER`,
    `ALTER TABLE message ADD COLUMN flagged INTEGER DEFAULT 0`,
    `ALTER TABLE message ADD COLUMN flag_reason TEXT`,
    `ALTER TABLE message ADD COLUMN processing_status TEXT DEFAULT 'completed' 
     CHECK (processing_status IN ('pending', 'processing', 'completed', 'error', 'cancelled'))`,
    `ALTER TABLE message ADD COLUMN processing_error TEXT`,
    `ALTER TABLE message ADD COLUMN has_attachments INTEGER DEFAULT 0`,
    `ALTER TABLE message ADD COLUMN attachment_count INTEGER DEFAULT 0`,
    `ALTER TABLE message ADD COLUMN reaction_count INTEGER DEFAULT 0`,
    `ALTER TABLE message ADD COLUMN updated_at INTEGER`,
    
    // Enhance chat table with new fields
    `ALTER TABLE chat ADD COLUMN category TEXT`,
    `ALTER TABLE chat ADD COLUMN subcategory TEXT`,
    `ALTER TABLE chat ADD COLUMN description TEXT`,
    `ALTER TABLE chat ADD COLUMN status TEXT DEFAULT 'active' 
     CHECK (status IN ('active', 'archived', 'deleted', 'template', 'shared'))`,
    `ALTER TABLE chat ADD COLUMN visibility TEXT DEFAULT 'private' 
     CHECK (visibility IN ('private', 'shared', 'public', 'team'))`,
    `ALTER TABLE chat ADD COLUMN is_favorite INTEGER DEFAULT 0`,
    `ALTER TABLE chat ADD COLUMN priority INTEGER DEFAULT 0`,
    `ALTER TABLE chat ADD COLUMN last_message_at INTEGER`,
    `ALTER TABLE chat ADD COLUMN participant_count INTEGER DEFAULT 1`,
    `ALTER TABLE chat ADD COLUMN has_custom_instructions INTEGER DEFAULT 0`,
    `ALTER TABLE chat ADD COLUMN has_branches INTEGER DEFAULT 0`,
    `ALTER TABLE chat ADD COLUMN branch_count INTEGER DEFAULT 0`,
    `ALTER TABLE chat ADD COLUMN average_rating REAL DEFAULT 0`,
    `ALTER TABLE chat ADD COLUMN total_ratings INTEGER DEFAULT 0`,
    `ALTER TABLE chat ADD COLUMN share_count INTEGER DEFAULT 0`,
    `ALTER TABLE chat ADD COLUMN is_public_template INTEGER DEFAULT 0`,
    
    // Enhance user table with new fields
    `ALTER TABLE user ADD COLUMN username TEXT UNIQUE`,
    `ALTER TABLE user ADD COLUMN bio TEXT`,
    `ALTER TABLE user ADD COLUMN timezone TEXT DEFAULT 'UTC'`,
    `ALTER TABLE user ADD COLUMN language TEXT DEFAULT 'en'`,
    `ALTER TABLE user ADD COLUMN last_active_at INTEGER`,
    `ALTER TABLE user ADD COLUMN chat_count INTEGER DEFAULT 0`,
    `ALTER TABLE user ADD COLUMN message_count INTEGER DEFAULT 0`,
    `ALTER TABLE user ADD COLUMN is_online INTEGER DEFAULT 0`,
    `ALTER TABLE user ADD COLUMN allow_notifications INTEGER DEFAULT 1`,
    `ALTER TABLE user ADD COLUMN allow_analytics INTEGER DEFAULT 1`,
    
    // Add comprehensive indexes
    `CREATE INDEX IF NOT EXISTS idx_message_version_message_id ON message_version(message_id)`,
    `CREATE INDEX IF NOT EXISTS idx_message_version_active ON message_version(is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_attachment_message_id ON message_attachment(message_id)`,
    `CREATE INDEX IF NOT EXISTS idx_attachment_status ON message_attachment(upload_status)`,
    `CREATE INDEX IF NOT EXISTS idx_reaction_message_id ON message_reaction(message_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reaction_user_id ON message_reaction(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_participant_chat_id ON chat_participant(chat_id)`,
    `CREATE INDEX IF NOT EXISTS idx_participant_user_id ON chat_participant(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_template_user_id ON chat_template(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_template_category ON chat_template(category)`,
    `CREATE INDEX IF EXISTS idx_template_public ON chat_template(is_public)`,
    `CREATE INDEX IF NOT EXISTS idx_settings_chat_id ON chat_settings(chat_id)`,
    `CREATE INDEX IF NOT EXISTS idx_branch_chat_id ON conversation_branch(chat_id)`,
    `CREATE INDEX IF NOT EXISTS idx_branch_parent ON conversation_branch(parent_message_id)`,
    `CREATE INDEX IF NOT EXISTS idx_message_branch_id ON message(branch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_message_updated_at ON message(updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_category ON chat(category)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_status ON chat(status)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_visibility ON chat(visibility)`,
    `CREATE INDEX IF NOT EXISTS idx_user_username ON user(username)`,
    `CREATE INDEX IF NOT EXISTS idx_user_last_active ON user(last_active_at)`,
  ],
  down: [
    // Drop indexes in reverse order
    'DROP INDEX IF EXISTS idx_user_last_active',
    'DROP INDEX IF EXISTS idx_user_username',
    'DROP INDEX IF EXISTS idx_chat_visibility',
    'DROP INDEX IF EXISTS idx_chat_status',
    'DROP INDEX IF EXISTS idx_chat_category',
    'DROP INDEX IF EXISTS idx_message_updated_at',
    'DROP INDEX IF EXISTS idx_message_branch_id',
    'DROP INDEX IF EXISTS idx_branch_parent',
    'DROP INDEX IF EXISTS idx_branch_chat_id',
    'DROP INDEX IF EXISTS idx_settings_chat_id',
    'DROP INDEX IF EXISTS idx_template_public',
    'DROP INDEX IF EXISTS idx_template_category',
    'DROP INDEX IF EXISTS idx_template_user_id',
    'DROP INDEX IF EXISTS idx_participant_user_id',
    'DROP INDEX IF EXISTS idx_participant_chat_id',
    'DROP INDEX IF EXISTS idx_reaction_user_id',
    'DROP INDEX IF EXISTS idx_reaction_message_id',
    'DROP INDEX IF EXISTS idx_attachment_status',
    'DROP INDEX IF EXISTS idx_attachment_message_id',
    'DROP INDEX IF EXISTS idx_message_version_active',
    'DROP INDEX IF EXISTS idx_message_version_message_id',
    
    // Drop new tables
    'DROP TABLE IF EXISTS conversation_branch',
    'DROP TABLE IF EXISTS chat_settings',
    'DROP TABLE IF EXISTS chat_template',
    'DROP TABLE IF EXISTS chat_participant',
    'DROP TABLE IF EXISTS message_reaction',
    'DROP TABLE IF EXISTS message_attachment',
    'DROP TABLE IF EXISTS message_version',
    
    // Note: SQLite doesn't support DROP COLUMN directly
    `-- SQLite limitation: Cannot drop columns directly
     -- Enhanced columns remain in tables for backward compatibility`,
  ]
});