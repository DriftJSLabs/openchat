import { createMigration } from './migration-manager';

/**
 * Migration 001: Initial Schema Setup
 * 
 * Creates the foundational database schema with basic tables for users, chats, 
 * messages, and sync management. This migration establishes the core structure
 * for the chat application's local database.
 */

export const migration001 = createMigration({
  version: '001',
  description: 'Initial schema setup with core tables',
  up: [
    // Create users table
    `CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    
    // Create basic chats table
    `CREATE TABLE IF NOT EXISTS chat (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_deleted INTEGER DEFAULT 0
    )`,
    
    // Create basic messages table
    `CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chat(id),
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_deleted INTEGER DEFAULT 0
    )`,
    
    // Create sync events table for tracking changes
    `CREATE TABLE IF NOT EXISTS sync_event (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'chat', 'message', 'analytics', 'preference')),
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'batch_create', 'batch_update')),
      data TEXT,
      timestamp INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    )`,
    
    // Create device tracking table
    `CREATE TABLE IF NOT EXISTS device (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      fingerprint TEXT NOT NULL UNIQUE,
      last_sync_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    
    // Create sync configuration table
    `CREATE TABLE IF NOT EXISTS sync_config (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      mode TEXT NOT NULL DEFAULT 'hybrid' CHECK (mode IN ('local-only', 'cloud-only', 'hybrid')),
      auto_sync INTEGER DEFAULT 1,
      sync_interval INTEGER DEFAULT 30000,
      updated_at INTEGER NOT NULL
    )`,
    
    // Create basic indexes for performance
    `CREATE INDEX IF NOT EXISTS idx_chat_user_id ON chat(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_message_chat_id ON message(chat_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sync_event_user_id ON sync_event(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sync_event_synced ON sync_event(synced)`,
    `CREATE INDEX IF NOT EXISTS idx_device_user_id ON device(user_id)`,
  ],
  down: [
    // Drop indexes first
    'DROP INDEX IF EXISTS idx_device_user_id',
    'DROP INDEX IF EXISTS idx_sync_event_synced',
    'DROP INDEX IF EXISTS idx_sync_event_user_id',
    'DROP INDEX IF EXISTS idx_message_chat_id',
    'DROP INDEX IF EXISTS idx_chat_user_id',
    
    // Drop tables in reverse order
    'DROP TABLE IF EXISTS sync_config',
    'DROP TABLE IF EXISTS device',
    'DROP TABLE IF EXISTS sync_event',
    'DROP TABLE IF EXISTS message',
    'DROP TABLE IF EXISTS chat',
    'DROP TABLE IF EXISTS user',
  ]
});