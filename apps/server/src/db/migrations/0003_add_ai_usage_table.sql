-- Migration: Add AI usage tracking table
-- Created: 2025-01-21
-- Description: Adds comprehensive AI usage tracking for monitoring, analytics, and cost management

CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id"),
  "chat_id" TEXT REFERENCES "chat"("id"),
  "message_id" TEXT REFERENCES "message"("id"),
  
  -- AI operation details
  "operation" TEXT NOT NULL CHECK ("operation" IN ('generation', 'embedding', 'moderation', 'summarization', 'translation', 'analysis')),
  "model" TEXT NOT NULL,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('openai', 'anthropic', 'google', 'local')),
  
  -- Usage metrics
  "prompt_tokens" INTEGER DEFAULT 0,
  "completion_tokens" INTEGER DEFAULT 0,
  "total_tokens" INTEGER DEFAULT 0,
  
  -- Cost and performance tracking
  "cost" INTEGER DEFAULT 0, -- Cost in micro-cents (1/1000000 of a cent) for precision
  "latency" INTEGER DEFAULT 0, -- Response time in milliseconds
  
  -- Status and quality metrics
  "status" TEXT NOT NULL CHECK ("status" IN ('success', 'error', 'timeout', 'rate_limited')),
  "error_message" TEXT,
  "finish_reason" TEXT CHECK ("finish_reason" IN ('stop', 'length', 'content_filter', 'function_call')),
  
  -- Quality metrics (if available)
  "quality_score" INTEGER, -- 0-100 score if quality assessment is available
  "user_feedback" TEXT CHECK ("user_feedback" IN ('positive', 'negative', 'neutral')),
  
  -- Metadata and context
  "request_metadata" TEXT, -- JSON string with additional request context
  "response_metadata" TEXT, -- JSON string with additional response context
  "user_agent" TEXT,
  "ip_address" TEXT,
  
  -- Timestamps
  "created_at" INTEGER NOT NULL,
  "completed_at" INTEGER
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "idx_ai_usage_user_id" ON "ai_usage"("user_id");
CREATE INDEX IF NOT EXISTS "idx_ai_usage_chat_id" ON "ai_usage"("chat_id");
CREATE INDEX IF NOT EXISTS "idx_ai_usage_created_at" ON "ai_usage"("created_at");
CREATE INDEX IF NOT EXISTS "idx_ai_usage_operation" ON "ai_usage"("operation");
CREATE INDEX IF NOT EXISTS "idx_ai_usage_model_provider" ON "ai_usage"("model", "provider");
CREATE INDEX IF NOT EXISTS "idx_ai_usage_status" ON "ai_usage"("status");
CREATE INDEX IF NOT EXISTS "idx_ai_usage_user_created" ON "ai_usage"("user_id", "created_at");

-- Add indexes to existing tables to support enhanced operations
CREATE INDEX IF NOT EXISTS "idx_chat_user_archived" ON "chat"("user_id", "is_archived") WHERE "is_deleted" = 0;
CREATE INDEX IF NOT EXISTS "idx_chat_user_pinned" ON "chat"("user_id", "is_pinned") WHERE "is_deleted" = 0;
CREATE INDEX IF NOT EXISTS "idx_chat_user_type" ON "chat"("user_id", "chat_type") WHERE "is_deleted" = 0;
CREATE INDEX IF NOT EXISTS "idx_chat_tags" ON "chat"("tags") WHERE "tags" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_message_parent" ON "message"("parent_message_id") WHERE "parent_message_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_message_type" ON "message"("message_type");
CREATE INDEX IF NOT EXISTS "idx_sync_event_entity" ON "sync_event"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_sync_event_user_timestamp" ON "sync_event"("user_id", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_chat_analytics_user" ON "chat_analytics"("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_preferences_user" ON "user_preferences"("user_id");