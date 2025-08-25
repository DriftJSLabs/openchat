-- Create user table
CREATE TABLE IF NOT EXISTS "user" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN DEFAULT false,
  image TEXT,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  location TEXT,
  website TEXT,
  avatar TEXT,
  timezone TEXT,
  language TEXT DEFAULT 'en',
  is_online BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  status TEXT DEFAULT 'offline',
  custom_status TEXT,
  is_active BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  is_verified BOOLEAN DEFAULT false,
  two_factor_enabled BOOLEAN DEFAULT false,
  is_suspended BOOLEAN DEFAULT false,
  suspended_until TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,
  is_private BOOLEAN DEFAULT false,
  allow_friend_requests BOOLEAN DEFAULT true,
  allow_direct_messages BOOLEAN DEFAULT true,
  show_online_status BOOLEAN DEFAULT true,
  email_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create session table
CREATE TABLE IF NOT EXISTS session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- Create dev user
INSERT INTO "user" (
  email,
  name,
  email_verified,
  username,
  display_name,
  bio,
  is_active,
  created_at,
  updated_at
) VALUES (
  'dev@openchat.local',
  'Developer User',
  true,
  'dev',
  'Dev User',
  'Development user for testing',
  true,
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- Show success
SELECT 'Database initialized successfully' as status;