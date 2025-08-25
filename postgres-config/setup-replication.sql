-- PostgreSQL Logical Replication Setup for ElectricSQL Integration
-- This script configures the necessary replication slots, publications, and permissions

-- =============================================================================
-- REPLICATION ROLE SETUP
-- =============================================================================

-- Create a dedicated replication user for ElectricSQL
-- This user should have minimal permissions for security
CREATE ROLE electric_replication WITH 
    LOGIN 
    PASSWORD 'electric_replication_password'  -- Change this in production
    REPLICATION;

-- Grant necessary permissions to the replication user
GRANT CONNECT ON DATABASE openchat TO electric_replication;
GRANT USAGE ON SCHEMA public TO electric_replication;

-- Grant SELECT permissions on all tables that will be replicated
GRANT SELECT ON ALL TABLES IN SCHEMA public TO electric_replication;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO electric_replication;

-- Ensure the replication user gets permissions on future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT ON TABLES TO electric_replication;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT ON SEQUENCES TO electric_replication;

-- =============================================================================
-- PUBLICATION SETUP
-- =============================================================================

-- Create a publication for all user-facing tables
-- This publication will be consumed by ElectricSQL for real-time sync
DROP PUBLICATION IF EXISTS electric_publication;

CREATE PUBLICATION electric_publication FOR TABLE 
    "user",
    chat,
    message,
    user_preferences,
    chat_analytics,
    sync_config,
    device,
    ai_usage
WITH (publish = 'insert, update, delete');

-- Alternative: Create table-specific publications for more granular control
-- This allows different sync strategies for different table types

-- Core chat functionality - high priority sync
DROP PUBLICATION IF EXISTS electric_core_publication;
CREATE PUBLICATION electric_core_publication FOR TABLE 
    "user",
    chat,
    message
WITH (publish = 'insert, update, delete');

-- User settings and preferences - medium priority sync
DROP PUBLICATION IF EXISTS electric_preferences_publication;
CREATE PUBLICATION electric_preferences_publication FOR TABLE 
    user_preferences,
    sync_config
WITH (publish = 'insert, update, delete');

-- Analytics and tracking - low priority sync
DROP PUBLICATION IF EXISTS electric_analytics_publication;
CREATE PUBLICATION electric_analytics_publication FOR TABLE 
    chat_analytics,
    ai_usage,
    device
WITH (publish = 'insert, update, delete');

-- =============================================================================
-- REPLICATION SLOT SETUP
-- =============================================================================

-- Create logical replication slots for ElectricSQL
-- Each slot represents a connection point for consuming changes

-- Main slot for primary ElectricSQL service
SELECT pg_create_logical_replication_slot(
    'electric_main_slot', 
    'pgoutput',
    false,  -- temporary = false (persistent slot)
    false   -- two_phase = false (not needed for ElectricSQL)
);

-- Additional slots for different environments or backup services
-- Uncomment as needed for your deployment strategy

-- Development environment slot
-- SELECT pg_create_logical_replication_slot('electric_dev_slot', 'pgoutput', false, false);

-- Staging environment slot  
-- SELECT pg_create_logical_replication_slot('electric_staging_slot', 'pgoutput', false, false);

-- Backup/analytics slot for data warehousing
-- SELECT pg_create_logical_replication_slot('electric_analytics_slot', 'pgoutput', false, false);

-- =============================================================================
-- ROW LEVEL SECURITY SETUP
-- =============================================================================

-- Enable Row Level Security (RLS) for multi-tenant data isolation
-- This ensures users can only access their own data through ElectricSQL

-- Enable RLS on user-specific tables
ALTER TABLE chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE message ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE device ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user data isolation
-- These policies ensure users can only see their own data

-- Chat table: Users can only see their own chats
DROP POLICY IF EXISTS chat_user_isolation ON chat;
CREATE POLICY chat_user_isolation ON chat
    FOR ALL
    TO electric_replication
    USING (user_id = current_setting('electric.user_id', true));

-- Message table: Users can only see messages from their chats
DROP POLICY IF EXISTS message_user_isolation ON message;
CREATE POLICY message_user_isolation ON message
    FOR ALL  
    TO electric_replication
    USING (
        chat_id IN (
            SELECT id FROM chat 
            WHERE user_id = current_setting('electric.user_id', true)
        )
    );

-- User preferences: Users can only see their own preferences
DROP POLICY IF EXISTS user_preferences_isolation ON user_preferences;
CREATE POLICY user_preferences_isolation ON user_preferences
    FOR ALL
    TO electric_replication
    USING (user_id = current_setting('electric.user_id', true));

-- Chat analytics: Users can only see their own analytics
DROP POLICY IF EXISTS chat_analytics_isolation ON chat_analytics;
CREATE POLICY chat_analytics_isolation ON chat_analytics
    FOR ALL
    TO electric_replication  
    USING (user_id = current_setting('electric.user_id', true));

-- Sync config: Users can only see their own sync configuration
DROP POLICY IF EXISTS sync_config_isolation ON sync_config;
CREATE POLICY sync_config_isolation ON sync_config
    FOR ALL
    TO electric_replication
    USING (user_id = current_setting('electric.user_id', true));

-- Device table: Users can only see their own devices
DROP POLICY IF EXISTS device_isolation ON device;
CREATE POLICY device_isolation ON device
    FOR ALL
    TO electric_replication
    USING (user_id = current_setting('electric.user_id', true));

-- AI usage: Users can only see their own usage data
DROP POLICY IF EXISTS ai_usage_isolation ON ai_usage;
CREATE POLICY ai_usage_isolation ON ai_usage
    FOR ALL
    TO electric_replication
    USING (user_id = current_setting('electric.user_id', true));

-- =============================================================================
-- INDEXES FOR REPLICATION PERFORMANCE
-- =============================================================================

-- Create indexes to optimize replication performance
-- These indexes help with filtering and ordering during sync operations

-- Indexes for user-based filtering (used by RLS policies)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_user_id_activity 
    ON chat (user_id, last_activity_at DESC) 
    WHERE is_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_chat_id_created 
    ON message (chat_id, created_at ASC) 
    WHERE is_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_preferences_user_id 
    ON user_preferences (user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_analytics_user_id 
    ON chat_analytics (user_id, last_used_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_user_id_sync 
    ON device (user_id, last_sync_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_usage_user_created 
    ON ai_usage (user_id, created_at DESC);

-- Indexes for sync optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_updated_at 
    ON chat (updated_at DESC) 
    WHERE is_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_created_at 
    ON message (created_at DESC) 
    WHERE is_deleted = false;

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_user_pinned_activity 
    ON chat (user_id, is_pinned DESC, last_activity_at DESC) 
    WHERE is_deleted = false;

-- =============================================================================
-- MONITORING AND MAINTENANCE
-- =============================================================================

-- Create a function to monitor replication lag
CREATE OR REPLACE FUNCTION get_electric_replication_lag()
RETURNS TABLE (
    slot_name name,
    active boolean,
    lag_bytes bigint,
    lag_seconds interval
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.slot_name,
        s.active,
        pg_wal_lsn_diff(pg_current_wal_lsn(), s.confirmed_flush_lsn) as lag_bytes,
        CASE 
            WHEN s.active THEN 
                age(now(), pg_stat_get_wal_receiver_activity())
            ELSE 
                NULL
        END as lag_seconds
    FROM pg_replication_slots s
    WHERE s.slot_name LIKE 'electric_%';
END;
$$ LANGUAGE plpgsql;

-- Create a function to reset replication slots (for emergency situations)
CREATE OR REPLACE FUNCTION reset_electric_replication_slot(slot_name text)
RETURNS boolean AS $$
BEGIN
    -- Drop and recreate the slot
    PERFORM pg_drop_replication_slot(slot_name);
    PERFORM pg_create_logical_replication_slot(slot_name, 'pgoutput', false, false);
    
    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- CLEANUP AND VALIDATION
-- =============================================================================

-- View to check replication status
CREATE OR REPLACE VIEW electric_replication_status AS
SELECT 
    slot_name,
    plugin,
    slot_type,
    datoid,
    database,
    active,
    active_pid,
    xmin,
    catalog_xmin,
    restart_lsn,
    confirmed_flush_lsn
FROM pg_replication_slots 
WHERE slot_name LIKE 'electric_%';

-- View to check publication status
CREATE OR REPLACE VIEW electric_publication_status AS
SELECT 
    pubname,
    pubowner,
    puballtables,
    pubinsert,
    pubupdate,
    pubdelete,
    pubtruncate
FROM pg_publication 
WHERE pubname LIKE 'electric_%';

-- Function to validate replication setup
CREATE OR REPLACE FUNCTION validate_electric_replication_setup()
RETURNS text AS $$
DECLARE
    result text := 'ElectricSQL Replication Setup Validation:' || chr(10);
    slot_count integer;
    pub_count integer;
    rls_count integer;
BEGIN
    -- Check replication slots
    SELECT count(*) INTO slot_count FROM pg_replication_slots WHERE slot_name LIKE 'electric_%';
    result := result || '- Replication slots: ' || slot_count || ' found' || chr(10);
    
    -- Check publications
    SELECT count(*) INTO pub_count FROM pg_publication WHERE pubname LIKE 'electric_%';
    result := result || '- Publications: ' || pub_count || ' found' || chr(10);
    
    -- Check RLS policies
    SELECT count(*) INTO rls_count FROM pg_policies WHERE policyname LIKE '%isolation%';
    result := result || '- RLS policies: ' || rls_count || ' found' || chr(10);
    
    -- Check if WAL level is logical
    IF current_setting('wal_level') = 'logical' THEN
        result := result || '- WAL level: OK (logical)' || chr(10);
    ELSE
        result := result || '- WAL level: ERROR (not logical)' || chr(10);
    END IF;
    
    result := result || chr(10) || 'Setup validation complete.';
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Run validation
SELECT validate_electric_replication_setup();

-- =============================================================================
-- HELPFUL QUERIES FOR MONITORING
-- =============================================================================

-- Query to check current replication status
-- SELECT * FROM electric_replication_status;

-- Query to check replication lag
-- SELECT * FROM get_electric_replication_lag();

-- Query to check publication tables
-- SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'electric_publication';

-- Query to check active replication connections
-- SELECT * FROM pg_stat_replication WHERE application_name LIKE '%electric%';