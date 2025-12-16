# Supabase Auth to public.users Sync - Setup Guide

## Overview

This setup ensures that every Supabase Auth signup automatically creates a corresponding user in `public.users`, allowing `getUser(user_id)` to work for auth users.

## Quick Start

1. **Run the SQL script** in your Supabase SQL Editor:
   ```sql
   -- Run: sync_auth_users.sql
   ```

2. **Verify the trigger is active**:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created_sync_to_public_users';
   ```

3. **Test the sync**:
   - Sign up a new user via Supabase Auth
   - Check that the user appears in `public.users`:
     ```sql
     SELECT * FROM public.users WHERE password_hash = 'AUTH_USER_NO_PASSWORD';
     ```

## How It Works

### Database Trigger

**Function**: `sync_auth_user_to_public_users()`
- **Trigger**: `on_auth_user_created_sync_to_public_users`
- **Event**: `AFTER INSERT ON auth.users`
- **Security**: `SECURITY DEFINER` (allows insert into public.users)

**What it does**:
1. When a new user is inserted into `auth.users`
2. Automatically inserts a row into `public.users` with:
   - `user_id` = `auth.users.id` (same UUID)
   - `email` = copied from `auth.users.email`
   - `username` = extracted from email prefix (e.g., `user@example.com` → `"user"`)
   - `password_hash` = `'AUTH_USER_NO_PASSWORD'` (placeholder, auth handles passwords)
   - `full_name`, `avatar_url` = from `raw_user_meta_data` if available
   - `status` = `'active'`
   - `created_at`, `last_login_at` = from auth.users

3. Uses `ON CONFLICT (user_id) DO NOTHING` to:
   - Safely ignore if user already exists
   - Protect demo users from being overwritten
   - Prevent duplicate insert errors

### Frontend Logic

**Auth Mode**:
- ✅ Uses `getUserWithRetry(authUserId)` - retries once if 404 (handles trigger timing)
- ❌ NEVER calls `createUser` for auth users
- Assumes trigger has created the user

**Demo Mode**:
- ✅ Uses `createUser` in `UserSelection.tsx` (unchanged)
- ✅ Demo users work as before

## Data Flow

```
User Signs Up via Supabase Auth
    ↓
auth.users INSERT (Supabase handles this)
    ↓
Trigger fires: sync_auth_user_to_public_users()
    ↓
public.users INSERT (trigger creates this)
    ↓
Frontend calls getUserWithRetry(authUserId)
    ↓
User loaded successfully ✅
```

## Troubleshooting

### "User not found" after signup

**Cause**: Trigger timing delay

**Solution**: 
- Frontend already handles this with `getUserWithRetry()` (retries after 500ms)
- If still failing, check if trigger is active:
  ```sql
  SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created_sync_to_public_users';
  ```

### "Email already registered" error

**Cause**: Frontend calling `createUser` for auth users

**Solution**: 
- Ensure frontend uses `getUserWithRetry()` for auth mode
- Never call `createUser` after signup/login
- Check `page.tsx` - should only call `getUserWithRetry()` for auth users

### Auth user not in public.users

**Cause**: Trigger not firing or failed

**Solution**:
1. Check trigger exists:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created_sync_to_public_users';
   ```

2. Check function exists:
   ```sql
   SELECT * FROM pg_proc WHERE proname = 'sync_auth_user_to_public_users';
   ```

3. Run backfill for existing auth users:
   ```sql
   -- Run the backfill query from sync_auth_users.sql
   ```

4. Test trigger manually:
   ```sql
   -- Check if trigger fires (look for new auth users)
   SELECT au.id, au.email, pu.user_id 
   FROM auth.users au
   LEFT JOIN public.users pu ON au.id = pu.user_id
   WHERE pu.user_id IS NULL;
   ```

### Username conflict

**Cause**: Two emails with same prefix (e.g., `user@example.com` and `user@other.com`)

**Solution**:
- Trigger uses email prefix for username
- If conflict occurs, PostgreSQL will error
- Consider using full email or email domain in username for uniqueness
- Or handle in trigger with conflict resolution

## Verification Queries

### Count synced users
```sql
SELECT 
  (SELECT COUNT(*) FROM auth.users) AS auth_users_count,
  (SELECT COUNT(*) FROM public.users) AS public_users_count,
  (SELECT COUNT(*) FROM auth.users au 
   INNER JOIN public.users pu ON au.id = pu.user_id) AS synced_count;
```

### List unsynced auth users
```sql
SELECT au.id, au.email, au.created_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.user_id = au.id
);
```

### List auth users in public.users
```sql
SELECT user_id, username, email, created_at
FROM public.users
WHERE password_hash = 'AUTH_USER_NO_PASSWORD'
ORDER BY created_at DESC;
```

## Important Notes

1. **password_hash**: Schema requires NOT NULL, so we use placeholder `'AUTH_USER_NO_PASSWORD'`. Auth handles passwords separately.

2. **Demo Users**: Protected by `ON CONFLICT DO NOTHING` - existing demo users are never modified.

3. **Username Uniqueness**: Derived from email prefix. If conflicts occur, consider using full email or adding domain.

4. **Trigger Timing**: Frontend retries once (500ms delay) to handle trigger execution delays.

5. **No Schema Changes**: This solution works with existing schema - no table modifications needed.
