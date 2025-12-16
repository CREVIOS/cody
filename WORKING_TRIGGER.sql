-- ============================================================================
-- SIMPLE WORKING TRIGGER - Just syncs auth.users to public.users
-- Uses ONLY columns that exist in public.users
-- ============================================================================

-- Drop old trigger/function
DROP TRIGGER IF EXISTS on_auth_user_created_sync_to_public_users ON auth.users;
DROP FUNCTION IF EXISTS sync_auth_user_to_public_users();

-- Create function
CREATE OR REPLACE FUNCTION sync_auth_user_to_public_users()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_username text;
BEGIN
  -- Get username from metadata or email prefix
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1)
  );
  
  -- Insert into public.users - ONLY columns that exist
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
    v_username,
    NEW.email,
    'AUTH_USER_NO_PASSWORD',
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name'
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    'active',
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- If username conflict, use email as username
    BEGIN
      INSERT INTO public.users (
        user_id,
        username,
        email,
        password_hash,
        status,
        created_at
      )
      VALUES (
        NEW.id,
        NEW.email,
        NEW.email,
        'AUTH_USER_NO_PASSWORD',
        'active',
        COALESCE(NEW.created_at, NOW())
      )
      ON CONFLICT (user_id) DO NOTHING;
      RETURN NEW;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN NEW;  -- Don't break auth signup
    END;
END;
$$;

-- Create trigger
CREATE TRIGGER on_auth_user_created_sync_to_public_users
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_auth_user_to_public_users();

-- Sync existing auth users
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
  au.id,
  COALESCE(
    au.raw_user_meta_data->>'username',
    SPLIT_PART(au.email, '@', 1)
  ),
  au.email,
  'AUTH_USER_NO_PASSWORD',
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name'
  ),
  au.raw_user_meta_data->>'avatar_url',
  'active',
  COALESCE(au.created_at, NOW())
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.user_id = au.id
)
ON CONFLICT (user_id) DO NOTHING;
