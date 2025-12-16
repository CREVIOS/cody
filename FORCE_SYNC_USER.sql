-- ============================================================================
-- FORCE SYNC: This will definitely work - no fancy logic, just direct insert
-- User ID: 4deae66a-de29-409a-a21c-8984cece83b4
-- ============================================================================

-- First, let's see what we're working with
SELECT '=== CHECKING AUTH.USERS ===' AS step;
SELECT id, email, created_at, raw_user_meta_data 
FROM auth.users 
WHERE id = '4deae66a-de29-409a-a21c-8984cece83b4';

SELECT '=== CHECKING PUBLIC.USERS (BEFORE) ===' AS step;
SELECT user_id, username, email 
FROM public.users 
WHERE user_id = '4deae66a-de29-409a-a21c-8984cece83b4';

-- Now let's get the actual data from auth.users
DO $$
DECLARE
  v_auth_id uuid := '4deae66a-de29-409a-a21c-8984cece83b4';
  v_email text;
  v_username text;
  v_full_name text;
  v_avatar_url text;
  v_created_at timestamptz;
  v_meta jsonb;
BEGIN
  -- Get data from auth.users
  SELECT 
    email,
    created_at,
    raw_user_meta_data
  INTO 
    v_email,
    v_created_at,
    v_meta
  FROM auth.users
  WHERE id = v_auth_id;
  
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'User % not found in auth.users!', v_auth_id;
  END IF;
  
  -- Extract username
  v_username := COALESCE(
    v_meta->>'username',
    SPLIT_PART(v_email, '@', 1)
  );
  
  -- Extract other fields
  v_full_name := COALESCE(
    v_meta->>'full_name',
    v_meta->>'name'
  );
  
  v_avatar_url := v_meta->>'avatar_url';
  
  -- Show what we're about to insert
  RAISE NOTICE 'About to insert:';
  RAISE NOTICE '  user_id: %', v_auth_id;
  RAISE NOTICE '  username: %', v_username;
  RAISE NOTICE '  email: %', v_email;
  RAISE NOTICE '  full_name: %', v_full_name;
  
  -- Delete if exists (to avoid conflicts)
  DELETE FROM public.users WHERE user_id = v_auth_id;
  
  -- Insert directly (removed last_login_at - column doesn't exist)
  INSERT INTO public.users (
    user_id,
    username,
    email,
    password_hash,
    full_name,
    avatar_url,
    status,
    created_at
  ) VALUES (
    v_auth_id,
    v_username,
    v_email,
    'AUTH_USER_NO_PASSWORD',
    v_full_name,
    v_avatar_url,
    'active',
    COALESCE(v_created_at, NOW())
  );
  
  RAISE NOTICE '✅ INSERT SUCCESSFUL!';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '❌ INSERT FAILED: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END $$;

-- Verify it worked
SELECT '=== VERIFICATION ===' AS step;
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM public.users WHERE user_id = '4deae66a-de29-409a-a21c-8984cece83b4')
    THEN '✅ USER NOW EXISTS IN public.users'
    ELSE '❌ USER STILL NOT FOUND'
  END AS result;

-- Show the final result
SELECT '=== FINAL RESULT ===' AS step;
SELECT 
  user_id,
  username,
  email,
  password_hash,
  full_name,
  status,
  created_at
FROM public.users
WHERE user_id = '4deae66a-de29-409a-a21c-8984cece83b4';
