# QUICK FIX: Auth Users Not Syncing

## Immediate Steps

1. **Run the FIXED SQL script**:
   ```sql
   -- Run: sync_auth_users_FIXED.sql in Supabase SQL Editor
   ```

2. **Check if trigger exists**:
   ```sql
   SELECT * FROM pg_trigger 
   WHERE tgname = 'on_auth_user_created_sync_to_public_users';
   ```
   - If empty → trigger not installed
   - If exists → check if `tgenabled = 'O'` (enabled)

3. **Check unsynced users**:
   ```sql
   SELECT au.id, au.email, au.created_at
   FROM auth.users au
   WHERE NOT EXISTS (
     SELECT 1 FROM public.users pu WHERE pu.user_id = au.id
   );
   ```

4. **Manually sync missing users** (if any):
   ```sql
   INSERT INTO public.users (user_id, username, email, password_hash, status, created_at, last_login_at)
   SELECT 
     au.id,
     COALESCE(au.raw_user_meta_data->>'username', SPLIT_PART(au.email, '@', 1)),
     au.email,
     'AUTH_USER_NO_PASSWORD',
     'active',
     COALESCE(au.created_at, NOW()),
     COALESCE(au.last_login_at, NOW())
   FROM auth.users au
   WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.user_id = au.id)
   ON CONFLICT (user_id) DO NOTHING;
   ```

## Common Issues

### Issue 1: Trigger Not Firing
**Check**: Run `DEBUG_TRIGGER.sql` to see if trigger exists

**Fix**: Run `sync_auth_users_FIXED.sql` - it includes proper permissions

### Issue 2: Username Conflicts
**Check**: Look for unique constraint violations in logs

**Fix**: The FIXED version handles this by:
- Appending numbers to duplicate usernames
- Falling back to email as username

### Issue 3: Permissions
**Check**: Function might not have INSERT permission

**Fix**: The FIXED version includes GRANT statements

### Issue 4: Search Path
**Check**: Function might not find `public.users` table

**Fix**: The FIXED version sets `search_path = public, auth`

## Test After Fix

1. Sign up a NEW user via Supabase Auth
2. Immediately check:
   ```sql
   SELECT * FROM public.users 
   WHERE user_id = '<new_auth_user_id>'
   ```
3. If user appears → trigger is working ✅
4. If not → check Supabase logs for errors

## If Still Not Working

Run this to see what's happening:
```sql
-- Check trigger status
SELECT tgname, tgenabled, tgrelid::regclass 
FROM pg_trigger 
WHERE tgname = 'on_auth_user_created_sync_to_public_users';

-- Check function
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'sync_auth_user_to_public_users';

-- Check recent auth users
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 5;

-- Check if they're in public.users
SELECT au.id, au.email, pu.user_id, pu.email
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.user_id
ORDER BY au.created_at DESC
LIMIT 5;
```
