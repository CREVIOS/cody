-- ============================================================================
-- FIXED: Supabase Auth to public.users Sync Trigger
-- ============================================================================
-- This version includes better error handling, permissions, and debugging
-- ============================================================================

-- Drop existing trigger and function first
DROP TRIGGER IF EXISTS on_auth_user_created_sync_to_public_users ON auth.users;
DROP FUNCTION IF EXISTS sync_auth_user_to_public_users();

-- ----------------------------------------------------------------------------
-- FUNCTION: Sync auth user to public.users (WITH ERROR HANDLING)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_auth_user_to_public_users()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  v_username text;
  v_full_name text;
  v_avatar_url text;
  v_username_suffix integer := 0;
  v_final_username text;
BEGIN
  -- Extract username from email prefix
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1)
  );
  
  -- Handle username conflicts by appending number if needed
  v_final_username := v_username;
  WHILE EXISTS (SELECT 1 FROM public.users WHERE username = v_final_username AND user_id != NEW.id) LOOP
    v_username_suffix := v_username_suffix + 1;
    v_final_username := v_username || v_username_suffix::text;
  END LOOP;
  
  -- Extract metadata
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name'
  );
  
  v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
  
  -- Insert into public.users
  -- Use ON CONFLICT to handle duplicates gracefully
  INSERT INTO public.users (
    user_id,
    username,
    email,
    password_hash,
    full_name,
    avatar_url,
    status,
    created_at
  )
  VALUES (
    NEW.id,  -- auth.users.id → public.users.user_id
    v_final_username,
    NEW.email,
    'AUTH_USER_NO_PASSWORD',  -- Placeholder (schema requires NOT NULL)
    v_full_name,
    v_avatar_url,
    'active',
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (user_id) DO NOTHING;  -- Skip if already exists
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Username conflict - try with email as username
    BEGIN
      INSERT INTO public.users (
        user_id,
        username,
        email,
        password_hash,
        full_name,
        avatar_url,
        status,
        created_at
      )
      VALUES (
        NEW.id,
        NEW.email,  -- Use full email as username fallback
        NEW.email,
        'AUTH_USER_NO_PASSWORD',
        v_full_name,
        v_avatar_url,
        'active',
        COALESCE(NEW.created_at, NOW())
      )
      ON CONFLICT (user_id) DO NOTHING;
      RETURN NEW;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to sync auth user even with email as username: % (user_id: %, email: %)', 
          SQLERRM, NEW.id, NEW.email;
        RETURN NEW;
    END;
  WHEN OTHERS THEN
    -- Log error but don't fail the auth.users insert
    RAISE WARNING 'Error syncing auth user to public.users: % (user_id: %, email: %)', 
      SQLERRM, NEW.id, NEW.email;
    RETURN NEW;  -- Still allow auth.users insert to succeed
END;
$$;

-- ----------------------------------------------------------------------------
-- GRANT PERMISSIONS (CRITICAL - without this trigger won't work)
-- ----------------------------------------------------------------------------
-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION sync_auth_user_to_public_users() TO postgres;
GRANT EXECUTE ON FUNCTION sync_auth_user_to_public_users() TO authenticated;
GRANT EXECUTE ON FUNCTION sync_auth_user_to_public_users() TO service_role;

-- Grant insert permission on public.users
GRANT INSERT ON public.users TO postgres;
GRANT INSERT ON public.users TO service_role;

-- ----------------------------------------------------------------------------
-- TRIGGER: Automatically sync on auth.users INSERT
-- ----------------------------------------------------------------------------
CREATE TRIGGER on_auth_user_created_sync_to_public_users
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_auth_user_to_public_users();

-- ----------------------------------------------------------------------------
-- ONE-TIME BACKFILL: Sync existing auth.users to public.users
-- ----------------------------------------------------------------------------
INSERT INTO public.users (
  user_id,
  username,
  email,
  password_hash,
  full_name,
  avatar_url,
  status,
  created_at
)
SELECT
  au.id AS user_id,
  -- Handle username conflicts
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
  COALESCE(au.created_at, NOW()) AS created_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1
  FROM public.users pu
  WHERE pu.user_id = au.id
)
ON CONFLICT (user_id) DO NOTHING
ON CONFLICT (username) DO UPDATE SET
  username = EXCLUDED.email;  -- Use email as username if conflict

-- ----------------------------------------------------------------------------
-- VERIFICATION: Check if it worked
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_unsynced_count integer;
  v_total_auth integer;
  v_total_public integer;
  v_synced_count integer;
BEGIN
  SELECT COUNT(*) INTO v_total_auth FROM auth.users;
  SELECT COUNT(*) INTO v_total_public FROM public.users;
  SELECT COUNT(*) INTO v_unsynced_count
  FROM auth.users au
  WHERE NOT EXISTS (
    SELECT 1 FROM public.users pu WHERE pu.user_id = au.id
  );
  SELECT COUNT(*) INTO v_synced_count
  FROM auth.users au
  INNER JOIN public.users pu ON au.id = pu.user_id;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SYNC STATUS:';
  RAISE NOTICE 'Total auth.users: %', v_total_auth;
  RAISE NOTICE 'Total public.users: %', v_total_public;
  RAISE NOTICE 'Synced users: %', v_synced_count;
  RAISE NOTICE 'Unsynced users: %', v_unsynced_count;
  RAISE NOTICE '========================================';
  
  IF v_unsynced_count > 0 THEN
    RAISE WARNING 'There are % unsynced auth users! Run DEBUG_TRIGGER.sql to see details.', v_unsynced_count;
  ELSE
    RAISE NOTICE '✅ All auth users are synced!';
  END IF;
END $$;
