import { createMigration } from './migration-manager';

/**
 * Migration 004: Analytics and Smart Suggestions
 * 
 * Adds comprehensive analytics tracking and smart suggestion capabilities.
 * This migration provides detailed usage metrics, performance monitoring,
 * and AI-powered suggestions to enhance user experience.
 */

export const migration004 = createMigration({
  version: '004',
  description: 'Add detailed analytics and smart suggestions',
  dependencies: ['003'],
  up: [
    // Detailed analytics with comprehensive metrics
    `CREATE TABLE IF NOT EXISTS detailed_analytics (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      chat_id TEXT REFERENCES chat(id),
      date TEXT NOT NULL,
      -- Message metrics
      messages_created INTEGER DEFAULT 0,
      messages_edited INTEGER DEFAULT 0,
      messages_deleted INTEGER DEFAULT 0,
      characters_typed INTEGER DEFAULT 0,
      words_typed INTEGER DEFAULT 0,
      -- Token usage metrics
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      estimated_cost REAL DEFAULT 0,
      -- Time metrics
      active_time_minutes INTEGER DEFAULT 0,
      average_response_time INTEGER DEFAULT 0,
      longest_session INTEGER DEFAULT 0,
      -- Feature usage metrics
      templates_used INTEGER DEFAULT 0,
      attachments_uploaded INTEGER DEFAULT 0,
      branches_created INTEGER DEFAULT 0,
      -- Quality metrics
      regeneration_count INTEGER DEFAULT 0,
      thumbs_up INTEGER DEFAULT 0,
      thumbs_down INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, chat_id, date)
    )`,
    
    // Smart suggestions for auto-completion and recommendations
    `CREATE TABLE IF NOT EXISTS smart_suggestion (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      chat_id TEXT REFERENCES chat(id),
      suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('completion', 'template', 'action', 'correction')),
      trigger_context TEXT NOT NULL,
      suggestion TEXT NOT NULL,
      confidence REAL DEFAULT 0,
      was_accepted INTEGER,
      was_shown INTEGER DEFAULT 0,
      metadata TEXT,
      created_at INTEGER NOT NULL
    )`,
    
    // Session tracking for detailed analytics
    `CREATE TABLE IF NOT EXISTS user_session (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      device_id TEXT NOT NULL,
      session_start INTEGER NOT NULL,
      session_end INTEGER,
      activity_duration INTEGER DEFAULT 0,
      messages_sent INTEGER DEFAULT 0,
      chats_created INTEGER DEFAULT 0,
      features_used TEXT,
      platform TEXT,
      user_agent TEXT,
      ip_address TEXT,
      location TEXT,
      created_at INTEGER NOT NULL
    )`,
    
    // Performance monitoring
    `CREATE TABLE IF NOT EXISTS performance_metric (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES user(id),
      metric_type TEXT NOT NULL CHECK (metric_type IN ('response_time', 'load_time', 'sync_time', 'error_rate')),
      metric_value REAL NOT NULL,
      context TEXT,
      timestamp INTEGER NOT NULL,
      device_info TEXT,
      created_at INTEGER NOT NULL
    )`,
    
    // Feature usage tracking
    `CREATE TABLE IF NOT EXISTS feature_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      feature_name TEXT NOT NULL,
      action TEXT NOT NULL,
      context TEXT,
      parameters TEXT,
      success INTEGER DEFAULT 1,
      error_message TEXT,
      timestamp INTEGER NOT NULL,
      session_id TEXT REFERENCES user_session(id)
    )`,
    
    // User feedback and ratings
    `CREATE TABLE IF NOT EXISTS user_feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      chat_id TEXT REFERENCES chat(id),
      message_id TEXT REFERENCES message(id),
      feedback_type TEXT NOT NULL CHECK (feedback_type IN ('rating', 'report', 'suggestion', 'bug')),
      rating INTEGER,
      feedback_text TEXT,
      category TEXT,
      severity TEXT,
      status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'closed')),
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    
    // A/B testing framework
    `CREATE TABLE IF NOT EXISTS ab_test (
      id TEXT PRIMARY KEY,
      test_name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
      start_date INTEGER,
      end_date INTEGER,
      target_percentage REAL DEFAULT 50,
      success_metric TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    
    `CREATE TABLE IF NOT EXISTS ab_test_participant (
      id TEXT PRIMARY KEY,
      test_id TEXT NOT NULL REFERENCES ab_test(id),
      user_id TEXT NOT NULL REFERENCES user(id),
      variant TEXT NOT NULL,
      assigned_at INTEGER NOT NULL,
      conversion_event TEXT,
      conversion_at INTEGER,
      metadata TEXT,
      UNIQUE(test_id, user_id)
    )`,
    
    // Search and discovery analytics
    `CREATE TABLE IF NOT EXISTS search_analytics (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      search_query TEXT NOT NULL,
      search_type TEXT NOT NULL CHECK (search_type IN ('chat', 'message', 'template', 'global')),
      results_count INTEGER DEFAULT 0,
      clicked_result_position INTEGER,
      clicked_result_id TEXT,
      search_duration INTEGER,
      filters_used TEXT,
      created_at INTEGER NOT NULL
    )`,
    
    // Error tracking and debugging
    `CREATE TABLE IF NOT EXISTS error_log (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES user(id),
      session_id TEXT REFERENCES user_session(id),
      error_type TEXT NOT NULL,
      error_message TEXT NOT NULL,
      stack_trace TEXT,
      context TEXT,
      severity TEXT DEFAULT 'error' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
      resolved INTEGER DEFAULT 0,
      resolution_notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    
    // Content moderation and safety
    `CREATE TABLE IF NOT EXISTS content_moderation (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      content_type TEXT NOT NULL CHECK (content_type IN ('message', 'chat_title', 'user_bio', 'template')),
      content_id TEXT NOT NULL,
      content_text TEXT NOT NULL,
      moderation_status TEXT DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged')),
      moderation_score REAL,
      flags TEXT,
      moderator_id TEXT REFERENCES user(id),
      moderation_notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    
    -- Add comprehensive indexes for analytics queries
    `CREATE INDEX IF NOT EXISTS idx_analytics_user_date ON detailed_analytics(user_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_analytics_chat_date ON detailed_analytics(chat_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_suggestion_user_id ON smart_suggestion(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_suggestion_type ON smart_suggestion(suggestion_type)`,
    `CREATE INDEX IF NOT EXISTS idx_suggestion_accepted ON smart_suggestion(was_accepted)`,
    `CREATE INDEX IF NOT EXISTS idx_session_user_id ON user_session(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_session_start ON user_session(session_start)`,
    `CREATE INDEX IF NOT EXISTS idx_performance_type ON performance_metric(metric_type)`,
    `CREATE INDEX IF NOT EXISTS idx_performance_timestamp ON performance_metric(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_feature_user_id ON feature_usage(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_feature_name ON feature_usage(feature_name)`,
    `CREATE INDEX IF NOT EXISTS idx_feature_timestamp ON feature_usage(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON user_feedback(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_feedback_type ON user_feedback(feedback_type)`,
    `CREATE INDEX IF NOT EXISTS idx_feedback_status ON user_feedback(status)`,
    `CREATE INDEX IF NOT EXISTS idx_ab_test_status ON ab_test(status)`,
    `CREATE INDEX IF NOT EXISTS idx_ab_participant_test ON ab_test_participant(test_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ab_participant_user ON ab_test_participant(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_search_user_id ON search_analytics(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_search_type ON search_analytics(search_type)`,
    `CREATE INDEX IF NOT EXISTS idx_search_timestamp ON search_analytics(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_error_user_id ON error_log(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_error_type ON error_log(error_type)`,
    `CREATE INDEX IF NOT EXISTS idx_error_severity ON error_log(severity)`,
    `CREATE INDEX IF NOT EXISTS idx_error_resolved ON error_log(resolved)`,
    `CREATE INDEX IF NOT EXISTS idx_moderation_status ON content_moderation(moderation_status)`,
    `CREATE INDEX IF NOT EXISTS idx_moderation_user_id ON content_moderation(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_moderation_type ON content_moderation(content_type)`,
  ],
  down: [
    // Drop indexes
    'DROP INDEX IF EXISTS idx_moderation_type',
    'DROP INDEX IF EXISTS idx_moderation_user_id',
    'DROP INDEX IF EXISTS idx_moderation_status',
    'DROP INDEX IF EXISTS idx_error_resolved',
    'DROP INDEX IF EXISTS idx_error_severity',
    'DROP INDEX IF EXISTS idx_error_type',
    'DROP INDEX IF EXISTS idx_error_user_id',
    'DROP INDEX IF EXISTS idx_search_timestamp',
    'DROP INDEX IF EXISTS idx_search_type',
    'DROP INDEX IF EXISTS idx_search_user_id',
    'DROP INDEX IF EXISTS idx_ab_participant_user',
    'DROP INDEX IF EXISTS idx_ab_participant_test',
    'DROP INDEX IF EXISTS idx_ab_test_status',
    'DROP INDEX IF EXISTS idx_feedback_status',
    'DROP INDEX IF EXISTS idx_feedback_type',
    'DROP INDEX IF EXISTS idx_feedback_user_id',
    'DROP INDEX IF EXISTS idx_feature_timestamp',
    'DROP INDEX IF EXISTS idx_feature_name',
    'DROP INDEX IF EXISTS idx_feature_user_id',
    'DROP INDEX IF EXISTS idx_performance_timestamp',
    'DROP INDEX IF EXISTS idx_performance_type',
    'DROP INDEX IF EXISTS idx_session_start',
    'DROP INDEX IF EXISTS idx_session_user_id',
    'DROP INDEX IF EXISTS idx_suggestion_accepted',
    'DROP INDEX IF EXISTS idx_suggestion_type',
    'DROP INDEX IF EXISTS idx_suggestion_user_id',
    'DROP INDEX IF EXISTS idx_analytics_chat_date',
    'DROP INDEX IF EXISTS idx_analytics_user_date',
    
    // Drop tables in reverse dependency order
    'DROP TABLE IF EXISTS content_moderation',
    'DROP TABLE IF EXISTS error_log',
    'DROP TABLE IF EXISTS search_analytics',
    'DROP TABLE IF EXISTS ab_test_participant',
    'DROP TABLE IF EXISTS ab_test',
    'DROP TABLE IF EXISTS user_feedback',
    'DROP TABLE IF EXISTS feature_usage',
    'DROP TABLE IF EXISTS performance_metric',
    'DROP TABLE IF EXISTS user_session',
    'DROP TABLE IF EXISTS smart_suggestion',
    'DROP TABLE IF EXISTS detailed_analytics',
  ]
});