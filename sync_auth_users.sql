-- ============================================================================
-- Supabase Auth to public.users Sync Trigger
-- ============================================================================
-- This script creates a trigger to automatically sync new auth.users to public.users
-- and provides a one-time backfill query for existing users.
--
-- Requirements:
-- - auth.users.id → public.users.user_id (same UUID)
-- - email is copied from auth.users.email
-- - username is derived from email prefix (user@example.com → "user")
-- - password_hash uses placeholder (schema requires NOT NULL, auth handles passwords)
-- - Demo users are untouched (ON CONFLICT prevents duplicates)
-- - Uses SECURITY DEFINER to allow insert into public.users
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNCTION: Sync auth user to public.users
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_auth_user_to_public_users()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into public.users when a new auth user is created
  -- auth.users.id is stored as public.users.user_id (same UUID)
  -- Use ON CONFLICT to safely ignore if user already exists (prevents errors)
  INSERT INTO public.users (
    user_id,
    username,
    email,
    password_hash,
    full_name,
    avatar_url,
    status,
    created_at,
    last_login_at
  )
  VALUES (
    NEW.id,  -- auth.users.id → public.users.user_id (same UUID)
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      SPLIT_PART(NEW.email, '@', 1)  -- Extract username from email prefix
    ),
    NEW.email,  -- Copy email from auth.users
    'AUTH_USER_NO_PASSWORD',  -- Placeholder (schema requires NOT NULL, auth handles passwords)
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name'
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    'active',
    NEW.created_at,
    NEW.last_login_at
  )
  ON CONFLICT (user_id) DO NOTHING;  -- Safely ignore if user already exists (demo users untouched)
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2. TRIGGER: Automatically sync on auth.users INSERT
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created_sync_to_public_users ON auth.users;

CREATE TRIGGER on_auth_user_created_sync_to_public_users
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_auth_user_to_public_users();

-- ----------------------------------------------------------------------------
-- 3. ONE-TIME BACKFILL: Sync existing auth.users to public.users
-- ----------------------------------------------------------------------------
-- This query inserts any auth.users that don't already exist in public.users
-- It does NOT modify or delete existing public.users rows (demo users untouched)
INSERT INTO public.users (
  user_id,
  username,
  email,
  password_hash,
  full_name,
  avatar_url,
  status,
  created_at,
  last_login_at
)
SELECT
  au.id AS user_id,  -- auth.users.id → public.users.user_id (same UUID)
  COALESCE(
    au.raw_user_meta_data->>'username',
    SPLIT_PART(au.email, '@', 1)  -- Extract username from email prefix
  ) AS username,
  au.email,  -- Copy email
  'AUTH_USER_NO_PASSWORD' AS password_hash,  -- Placeholder (schema requires NOT NULL)
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name'
  ) AS full_name,
  au.raw_user_meta_data->>'avatar_url' AS avatar_url,
  'active' AS status,
  au.created_at,
  au.last_login_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1
  FROM public.users pu
  WHERE pu.user_id = au.id  -- Only insert if user_id doesn't exist
)
ON CONFLICT (user_id) DO NOTHING;  -- Safety: skip if somehow conflicts (demo users protected)

-- ============================================================================
-- Verification Queries (optional - run these to verify sync)
-- ============================================================================

-- Count auth users vs public users
-- SELECT 
--   (SELECT COUNT(*) FROM auth.users) AS auth_users_count,
--   (SELECT COUNT(*) FROM public.users) AS public_users_count,
--   (SELECT COUNT(*) FROM auth.users au 
--    INNER JOIN public.users pu ON au.id = pu.user_id) AS synced_count;

-- List auth users not in public.users (should be 0 after backfill)
-- SELECT au.id, au.email, au.created_at
-- FROM auth.users au
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.users pu WHERE pu.user_id = au.id
-- );
