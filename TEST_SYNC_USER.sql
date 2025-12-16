-- ============================================================================
-- TEST: Sync specific auth user to public.users
-- User ID: 4deae66a-de29-409a-a21c-8984cece83b4
-- ============================================================================

-- 1. Check if user exists in auth.users
SELECT 
  'AUTH.USERS' AS source,
  id,
  email,
  created_at,
  raw_user_meta_data
FROM auth.users
WHERE id = '4deae66a-de29-409a-a21c-8984cece83b4';

-- 2. Check if user exists in public.users
SELECT 
  'PUBLIC.USERS' AS source,
  user_id,
  username,
  email,
  password_hash,
  created_at
FROM public.users
WHERE user_id = '4deae66a-de29-409a-a21c-8984cece83b4';

-- 3. Sync the user (insert if not exists)
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
  au.id AS user_id,
  COALESCE(
    au.raw_user_meta_data->>'username',
    SPLIT_PART(au.email, '@', 1)
  ) AS username,
  au.email,
  'AUTH_USER_NO_PASSWORD' AS password_hash,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name'
  ) AS full_name,
  au.raw_user_meta_data->>'avatar_url' AS avatar_url,
  'active' AS status,
  COALESCE(au.created_at, NOW()) AS created_at,
  COALESCE(au.last_login_at, NOW()) AS last_login_at
FROM auth.users au
WHERE au.id = '4deae66a-de29-409a-a21c-8984cece83b4'
  AND NOT EXISTS (
    SELECT 1
    FROM public.users pu
    WHERE pu.user_id = au.id
  )
ON CONFLICT (user_id) DO NOTHING;

-- 4. Verify the sync worked
SELECT 
  'VERIFICATION' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_id = '4deae66a-de29-409a-a21c-8984cece83b4'
    ) THEN '✅ USER EXISTS IN public.users'
    ELSE '❌ USER NOT FOUND IN public.users'
  END AS status;

-- 5. Show the synced user
SELECT 
  user_id,
  username,
  email,
  password_hash,
  full_name,
  avatar_url,
  status,
  created_at
FROM public.users
WHERE user_id = '4deae66a-de29-409a-a21c-8984cece83b4';
