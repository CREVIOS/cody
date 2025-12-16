-- ============================================================================
-- DEBUG: Check if trigger is working
-- ============================================================================

-- 1. Check if trigger exists
SELECT 
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  tgenabled AS enabled,
  tgisinternal AS is_internal
FROM pg_trigger
WHERE tgname = 'on_auth_user_created_sync_to_public_users';

-- 2. Check if function exists
SELECT 
  proname AS function_name,
  prosrc AS function_source
FROM pg_proc
WHERE proname = 'sync_auth_user_to_public_users';

-- 3. Check recent auth.users
SELECT 
  id,
  email,
  created_at,
  raw_user_meta_data
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check if those users exist in public.users
SELECT 
  au.id AS auth_user_id,
  au.email AS auth_email,
  au.created_at AS auth_created_at,
  pu.user_id AS public_user_id,
  pu.email AS public_email,
  CASE 
    WHEN pu.user_id IS NULL THEN 'MISSING IN public.users'
    ELSE 'EXISTS'
  END AS status
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.user_id
ORDER BY au.created_at DESC
LIMIT 10;

-- 5. Count unsynced users
SELECT 
  COUNT(*) AS unsynced_count
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.user_id = au.id
);

-- 6. Test trigger manually (if you have a test auth user)
-- This will show if the function works when called directly
-- DO NOT RUN THIS ON PRODUCTION - it's just for testing
/*
DO $$
DECLARE
  test_user_id uuid;
BEGIN
  -- Get a recent auth user
  SELECT id INTO test_user_id 
  FROM auth.users 
  WHERE NOT EXISTS (
    SELECT 1 FROM public.users WHERE user_id = auth.users.id
  )
  LIMIT 1;
  
  IF test_user_id IS NOT NULL THEN
    -- Try to manually call the function logic
    RAISE NOTICE 'Testing with user_id: %', test_user_id;
  ELSE
    RAISE NOTICE 'No unsynced users found';
  END IF;
END $$;
*/
