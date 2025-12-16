-- ============================================================================
-- CHECK IF TRIGGER IS ACTUALLY WORKING
-- ============================================================================

-- 1. Check if trigger exists and is enabled
SELECT 
  'TRIGGER STATUS' AS check_type,
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  CASE tgenabled
    WHEN 'O' THEN '✅ ENABLED'
    WHEN 'D' THEN '❌ DISABLED'
    ELSE 'UNKNOWN'
  END AS status,
  tgenabled AS enabled_code
FROM pg_trigger
WHERE tgname = 'on_auth_user_created_sync_to_public_users';

-- 2. Check if function exists
SELECT 
  'FUNCTION STATUS' AS check_type,
  proname AS function_name,
  CASE 
    WHEN proname IS NOT NULL THEN '✅ EXISTS'
    ELSE '❌ NOT FOUND'
  END AS status
FROM pg_proc
WHERE proname = 'sync_auth_user_to_public_users';

-- 3. Check recent auth users (last 5)
SELECT 
  'RECENT AUTH USERS' AS check_type,
  id,
  email,
  created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- 4. Check if those users are in public.users
SELECT 
  'SYNC STATUS' AS check_type,
  au.id AS auth_user_id,
  au.email AS auth_email,
  au.created_at AS auth_created,
  CASE 
    WHEN pu.user_id IS NOT NULL THEN '✅ SYNCED'
    ELSE '❌ NOT SYNCED'
  END AS sync_status,
  pu.user_id AS public_user_id
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.user_id
ORDER BY au.created_at DESC
LIMIT 5;

-- 5. Count unsynced users
SELECT 
  'UNSYNCED COUNT' AS check_type,
  COUNT(*) AS unsynced_users
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.user_id = au.id
);
