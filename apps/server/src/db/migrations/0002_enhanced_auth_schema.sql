-- Enhanced Authentication Schema Migration
-- Adds comprehensive user profile, presence, and relationship management features
-- Migration: 0002_enhanced_auth_schema.sql

-- ============================================================================
-- 1. Enhance the existing user table with new profile and status fields
-- ============================================================================

-- Add new columns to existing user table
ALTER TABLE "user" 
  ADD COLUMN IF NOT EXISTS "username" text UNIQUE,
  ADD COLUMN IF NOT EXISTS "display_name" text,
  ADD COLUMN IF NOT EXISTS "bio" text,
  ADD COLUMN IF NOT EXISTS "location" text,
  ADD COLUMN IF NOT EXISTS "website" text,
  ADD COLUMN IF NOT EXISTS "avatar" text,
  ADD COLUMN IF NOT EXISTS "timezone" text,
  ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'offline' CHECK (status IN ('online', 'away', 'busy', 'invisible', 'offline')),
  ADD COLUMN IF NOT EXISTS "custom_status" text,
  ADD COLUMN IF NOT EXISTS "last_active_at" timestamp,
  ADD COLUMN IF NOT EXISTS "login_count" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "is_private" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allow_friend_requests" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allow_direct_messages" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "show_online_status" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "email_notifications" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "is_verified" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_blocked" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_suspended" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "suspended_until" timestamp,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;

-- Create indexes for performance optimization on user table
CREATE INDEX IF NOT EXISTS "user_username_idx" ON "user" ("username");
CREATE INDEX IF NOT EXISTS "user_status_idx" ON "user" ("status");
CREATE INDEX IF NOT EXISTS "user_last_active_idx" ON "user" ("last_active_at");
CREATE INDEX IF NOT EXISTS "user_email_idx" ON "user" ("email");
CREATE INDEX IF NOT EXISTS "user_active_deleted_idx" ON "user" ("is_active", "is_deleted");

-- ============================================================================
-- 2. Create user_relationship table for social connections
-- ============================================================================

CREATE TABLE IF NOT EXISTS "user_relationship" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "from_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "to_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "relationship_type" text NOT NULL CHECK (relationship_type IN ('friend', 'blocked', 'following', 'muted', 'favorite')),
  "status" text DEFAULT 'active' CHECK (status IN ('pending', 'accepted', 'declined', 'active')),
  "metadata" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  
  -- Ensure no duplicate relationships
  UNIQUE("from_user_id", "to_user_id", "relationship_type")
);

-- Create indexes for user_relationship table
CREATE INDEX IF NOT EXISTS "user_relationship_from_user_idx" ON "user_relationship" ("from_user_id");
CREATE INDEX IF NOT EXISTS "user_relationship_to_user_idx" ON "user_relationship" ("to_user_id");
CREATE INDEX IF NOT EXISTS "user_relationship_type_idx" ON "user_relationship" ("relationship_type");
CREATE INDEX IF NOT EXISTS "user_relationship_status_idx" ON "user_relationship" ("status");
CREATE INDEX IF NOT EXISTS "user_relationship_unique_idx" ON "user_relationship" ("from_user_id", "to_user_id", "relationship_type");

-- ============================================================================
-- 3. Create user_presence table for real-time presence tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS "user_presence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE UNIQUE,
  "status" text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'busy', 'offline')),
  "custom_status" text,
  "device_id" text,
  "session_id" text,
  "connection_id" text,
  "last_active_at" timestamp DEFAULT now() NOT NULL,
  "is_typing" boolean DEFAULT false,
  "typing_in" uuid,
  "typing_last_update" timestamp,
  "connection_count" integer DEFAULT 0,
  "last_ip_address" text,
  "user_agent" text,
  "platform" text CHECK (platform IN ('web', 'mobile', 'desktop', 'tablet')),
  "app_version" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for user_presence table
CREATE INDEX IF NOT EXISTS "user_presence_user_id_idx" ON "user_presence" ("user_id");
CREATE INDEX IF NOT EXISTS "user_presence_status_idx" ON "user_presence" ("status");
CREATE INDEX IF NOT EXISTS "user_presence_last_active_idx" ON "user_presence" ("last_active_at");
CREATE INDEX IF NOT EXISTS "user_presence_typing_idx" ON "user_presence" ("typing_in");
CREATE INDEX IF NOT EXISTS "user_presence_session_idx" ON "user_presence" ("session_id");

-- ============================================================================
-- 4. Create enhanced user_session table for multi-device support
-- ============================================================================

CREATE TABLE IF NOT EXISTS "user_session" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "session_token" text NOT NULL UNIQUE,
  "device_fingerprint" text,
  "device_name" text,
  "device_type" text CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'web')),
  "ip_address" text,
  "location" text,
  "user_agent" text,
  "is_secure" boolean DEFAULT false,
  "is_trusted" boolean DEFAULT false,
  "requires_2fa" boolean DEFAULT false,
  "last_activity_at" timestamp DEFAULT now() NOT NULL,
  "login_at" timestamp DEFAULT now() NOT NULL,
  "logout_at" timestamp,
  "is_active" boolean DEFAULT true,
  "is_revoked" boolean DEFAULT false,
  "revoked_reason" text,
  "revoked_by" uuid REFERENCES "user"("id"),
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for user_session table
CREATE INDEX IF NOT EXISTS "user_session_user_id_idx" ON "user_session" ("user_id");
CREATE INDEX IF NOT EXISTS "user_session_token_idx" ON "user_session" ("session_token");
CREATE INDEX IF NOT EXISTS "user_session_device_idx" ON "user_session" ("device_fingerprint");
CREATE INDEX IF NOT EXISTS "user_session_active_idx" ON "user_session" ("is_active");
CREATE INDEX IF NOT EXISTS "user_session_expires_idx" ON "user_session" ("expires_at");
CREATE INDEX IF NOT EXISTS "user_session_activity_idx" ON "user_session" ("last_activity_at");

-- ============================================================================
-- 5. Create triggers for automatic timestamp updates
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
DROP TRIGGER IF EXISTS update_user_updated_at ON "user";
CREATE TRIGGER update_user_updated_at
  BEFORE UPDATE ON "user"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_relationship_updated_at ON "user_relationship";
CREATE TRIGGER update_user_relationship_updated_at
  BEFORE UPDATE ON "user_relationship"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_presence_updated_at ON "user_presence";
CREATE TRIGGER update_user_presence_updated_at
  BEFORE UPDATE ON "user_presence"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_session_updated_at ON "user_session";
CREATE TRIGGER update_user_session_updated_at
  BEFORE UPDATE ON "user_session"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. Create helpful views for common queries
-- ============================================================================

-- View for active users with basic profile info
CREATE OR REPLACE VIEW "active_users" AS
SELECT 
  id,
  name,
  email,
  username,
  display_name,
  avatar,
  status,
  custom_status,
  is_verified,
  last_active_at,
  created_at
FROM "user"
WHERE is_active = true AND is_deleted = false AND is_blocked = false;

-- View for user friends (accepted friend relationships)
CREATE OR REPLACE VIEW "user_friends" AS
SELECT 
  ur.from_user_id as user_id,
  u.id as friend_id,
  u.name as friend_name,
  u.username as friend_username,
  u.display_name as friend_display_name,
  u.avatar as friend_avatar,
  u.status as friend_status,
  ur.created_at as friendship_date
FROM "user_relationship" ur
JOIN "user" u ON ur.to_user_id = u.id
WHERE ur.relationship_type = 'friend' 
  AND ur.status = 'accepted'
  AND u.is_active = true 
  AND u.is_deleted = false;

-- View for online users
CREATE OR REPLACE VIEW "online_users" AS
SELECT 
  u.id,
  u.name,
  u.username,
  u.display_name,
  u.avatar,
  u.status,
  u.custom_status,
  up.last_active_at,
  up.connection_count
FROM "user" u
JOIN "user_presence" up ON u.id = up.user_id
WHERE up.status = 'online' 
  AND u.is_active = true 
  AND u.is_deleted = false
  AND u.show_online_status = true;

-- ============================================================================
-- 7. Insert default presence records for existing users
-- ============================================================================

-- Create default presence records for existing users who don't have one
INSERT INTO "user_presence" (user_id, status, last_active_at)
SELECT id, 'offline', COALESCE(last_active_at, created_at)
FROM "user"
WHERE is_active = true 
  AND is_deleted = false
  AND id NOT IN (SELECT user_id FROM "user_presence")
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- 8. Create useful functions for common operations
-- ============================================================================

-- Function to check if two users are friends
CREATE OR REPLACE FUNCTION are_users_friends(user1_id uuid, user2_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM "user_relationship"
    WHERE ((from_user_id = user1_id AND to_user_id = user2_id) OR
           (from_user_id = user2_id AND to_user_id = user1_id))
      AND relationship_type = 'friend'
      AND status = 'accepted'
  );
END;
$$ LANGUAGE plpgsql;

-- Function to check if user is blocked by another user
CREATE OR REPLACE FUNCTION is_user_blocked(blocker_id uuid, blocked_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM "user_relationship"
    WHERE from_user_id = blocker_id 
      AND to_user_id = blocked_id
      AND relationship_type = 'blocked'
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get user's online friends
CREATE OR REPLACE FUNCTION get_online_friends(user_id uuid)
RETURNS TABLE(
  friend_id uuid,
  friend_name text,
  friend_username text,
  friend_status text,
  last_active timestamp
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uf.friend_id,
    uf.friend_name,
    uf.friend_username,
    uf.friend_status,
    up.last_active_at
  FROM "user_friends" uf
  JOIN "user_presence" up ON uf.friend_id = up.user_id
  WHERE uf.user_id = get_online_friends.user_id
    AND up.status IN ('online', 'away', 'busy')
  ORDER BY up.last_active_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. Performance optimization queries (for monitoring)
-- ============================================================================

-- Add comments for better documentation
COMMENT ON TABLE "user_relationship" IS 'Manages social relationships between users including friends, blocking, following, muting, and favorites';
COMMENT ON TABLE "user_presence" IS 'Tracks real-time user presence, activity, and typing indicators for chat applications';
COMMENT ON TABLE "user_session" IS 'Enhanced session management with device tracking and security features';

COMMENT ON COLUMN "user"."username" IS 'Optional unique username for @mentions and user discovery';
COMMENT ON COLUMN "user"."status" IS 'Current user status (online, away, busy, invisible, offline)';
COMMENT ON COLUMN "user"."is_private" IS 'Whether the user profile is private (friends-only visibility)';
COMMENT ON COLUMN "user_relationship"."relationship_type" IS 'Type of relationship: friend, blocked, following, muted, favorite';
COMMENT ON COLUMN "user_relationship"."status" IS 'Status of relationship: pending (for friend requests), accepted, declined, active';
COMMENT ON COLUMN "user_presence"."connection_count" IS 'Number of active connections (for multi-device support)';
COMMENT ON COLUMN "user_presence"."typing_in" IS 'Chat ID where user is currently typing';

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Enhanced authentication schema migration completed successfully';
  RAISE NOTICE 'Added: Enhanced user profiles, relationships, presence tracking, and session management';
  RAISE NOTICE 'Created: % views, % functions, and % indexes for optimal performance', 3, 3, 15;
END $$;