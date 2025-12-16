-- ============================================================================
-- ENABLE TRIGGER AND TEST IT
-- ============================================================================

-- 1. Make sure trigger is enabled
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created_sync_to_public_users;

-- 2. Verify it's enabled
SELECT 
  tgname,
  CASE tgenabled
    WHEN 'O' THEN '✅ ENABLED'
    ELSE '❌ DISABLED - FIX IT!'
  END AS status
FROM pg_trigger
WHERE tgname = 'on_auth_user_created_sync_to_public_users';

-- 3. Test: Check if trigger fires by looking at recent signups
-- If you signed up recently, check if that user is synced:
SELECT 
  'TEST: Recent signups' AS test,
  au.id,
  au.email,
  au.created_at,
  CASE 
    WHEN pu.user_id IS NOT NULL THEN '✅ TRIGGER WORKED'
    ELSE '❌ TRIGGER DID NOT FIRE'
  END AS result
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.user_id
WHERE au.created_at > NOW() - INTERVAL '1 hour'
ORDER BY au.created_at DESC;
