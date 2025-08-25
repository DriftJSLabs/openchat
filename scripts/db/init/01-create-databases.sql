-- ==============================================================================
-- OpenChat Database Initialization Script
-- ==============================================================================
-- This script creates the necessary databases and users for OpenChat
-- Runs automatically when PostgreSQL container starts for the first time

-- Create test database if it doesn't exist
-- Note: CREATE DATABASE cannot be executed from a function, so we use conditional statements
SELECT 'CREATE DATABASE openchat_test WITH OWNER = openchat ENCODING = ''UTF8'' LC_COLLATE = ''en_US.utf8'' LC_CTYPE = ''en_US.utf8'' TEMPLATE = template0 CONNECTION_LIMIT = -1'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'openchat_test')\gexec

-- Create extensions for main database
\c openchat_dev;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Create extensions for test database
\c openchat_test;

-- Enable required extensions for test database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Switch back to main database
\c openchat_dev;

-- Create custom functions and triggers if needed
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to generate short IDs (alternative to nanoid)
CREATE OR REPLACE FUNCTION generate_short_id(length INTEGER DEFAULT 12)
RETURNS TEXT AS $$
DECLARE
    alphabet TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..length LOOP
        result := result || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE openchat_dev TO openchat;
GRANT ALL PRIVILEGES ON DATABASE openchat_test TO openchat;

-- Configure database for optimal performance
ALTER DATABASE openchat_dev SET timezone TO 'UTC';
ALTER DATABASE openchat_test SET timezone TO 'UTC';

-- Log initialization completion
DO $$
BEGIN
    RAISE NOTICE 'OpenChat database initialization completed successfully';
END
$$;