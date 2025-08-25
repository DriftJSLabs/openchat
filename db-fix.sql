-- Ensure dev user exists
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
) ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();

-- Show the user
SELECT id, email, name FROM "user" WHERE email = 'dev@openchat.local';