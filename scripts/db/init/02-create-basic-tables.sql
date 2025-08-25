-- ==============================================================================
-- OpenChat Basic Table Creation and Dev User Setup
-- ==============================================================================
-- This script creates essential tables and inserts development data
-- Run after database extensions are installed

-- Switch to main database for table creation
\c openchat_dev;

-- Create users table with minimal required fields for development
-- This is a simplified version that will be replaced by proper migrations
CREATE TABLE IF NOT EXISTS "user" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  image TEXT,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  is_online BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  last_active_at TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('online', 'away', 'busy', 'invisible', 'offline')) DEFAULT 'offline',
  is_active BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create session table for authentication
CREATE TABLE IF NOT EXISTS "session" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

-- Create account table for OAuth providers
CREATE TABLE IF NOT EXISTS "account" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMP WITH TIME ZONE,
  refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create verification table for email verification
CREATE TABLE IF NOT EXISTS "verification" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create basic chat table (legacy compatibility)
CREATE TABLE IF NOT EXISTS "chat" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  chat_type TEXT CHECK (chat_type IN ('conversation', 'assistant', 'group', 'system')) NOT NULL DEFAULT 'conversation',
  settings TEXT, -- JSON stringified chat settings
  tags TEXT, -- JSON array of tags
  is_pinned BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);

-- Create basic message table for initial testing
CREATE TABLE IF NOT EXISTS "message" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES "chat"(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_type TEXT CHECK (content_type IN ('text', 'image', 'file', 'audio', 'video', 'code', 'system')) NOT NULL DEFAULT 'text',
  role TEXT CHECK (role IN ('user', 'assistant', 'system')) NOT NULL DEFAULT 'user',
  model TEXT,
  token_count INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create essential indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);
CREATE INDEX IF NOT EXISTS idx_user_username ON "user"(username);
CREATE INDEX IF NOT EXISTS idx_session_token ON "session"(token);
CREATE INDEX IF NOT EXISTS idx_session_user_id ON "session"(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_user_id ON "chat"(user_id);
CREATE INDEX IF NOT EXISTS idx_message_chat_id ON "message"(chat_id);
CREATE INDEX IF NOT EXISTS idx_message_user_id ON "message"(user_id);
CREATE INDEX IF NOT EXISTS idx_message_created_at ON "message"(created_at);

-- Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_user_updated_at BEFORE UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_session_updated_at BEFORE UPDATE ON "session"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_account_updated_at BEFORE UPDATE ON "account"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_verification_updated_at BEFORE UPDATE ON "verification"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_updated_at BEFORE UPDATE ON "chat"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_message_updated_at BEFORE UPDATE ON "message"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert development user for testing
-- This user will be used for development and testing purposes
INSERT INTO "user" (
  id,
  name, 
  email, 
  email_verified,
  username,
  display_name,
  bio,
  status,
  is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001',  -- Fixed UUID for consistent dev user
  'Development User',
  'dev@openchat.local',
  true,
  'devuser',
  'Dev User',
  'Development and testing account',
  'online',
  true
) ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  username = EXCLUDED.username,
  display_name = EXCLUDED.display_name,
  bio = EXCLUDED.bio,
  updated_at = NOW();

-- Create a default account entry for the development user (password-based)
INSERT INTO "account" (
  id,
  account_id,
  provider_id,
  user_id,
  password
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'dev@openchat.local',
  'credential',
  '00000000-0000-0000-0000-000000000001',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj5WlFrA3K2K'  -- hashed 'password123'
) ON CONFLICT (account_id, provider_id) DO UPDATE SET
  password = EXCLUDED.password,
  updated_at = NOW();

-- Create a sample chat for the dev user
INSERT INTO "chat" (
  id,
  title,
  user_id,
  chat_type
) VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Welcome to OpenChat',
  '00000000-0000-0000-0000-000000000001',
  'assistant'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  updated_at = NOW();

-- Insert a welcome message
INSERT INTO "message" (
  id,
  chat_id,
  user_id,
  content,
  content_type,
  role
) VALUES (
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Welcome to OpenChat! This is your development environment. You can start chatting right away.',
  'text',
  'system'
) ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  updated_at = NOW();

-- Apply same basic structure to test database
\c openchat_test;

-- Repeat the same table creation for test database (abbreviated)
CREATE TABLE IF NOT EXISTS "user" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  image TEXT,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  is_online BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  last_active_at TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('online', 'away', 'busy', 'invisible', 'offline')) DEFAULT 'offline',
  is_active BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMP WITH TIME ZONE,
  refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Essential indexes for test database
CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);
CREATE INDEX IF NOT EXISTS idx_session_token ON "session"(token);
CREATE INDEX IF NOT EXISTS idx_session_user_id ON "session"(user_id);

-- Apply the updated_at function to test database as well
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Log initialization completion
DO $$
BEGIN
    RAISE NOTICE 'OpenChat basic tables and dev user created successfully';
END
$$;