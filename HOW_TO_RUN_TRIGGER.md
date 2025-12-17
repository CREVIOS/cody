# How to Run the Trigger Script

## The Problem
You're getting "must be owner of table users" error because you need admin permissions.

## Solution: Run in Supabase Dashboard

1. **Go to Supabase Dashboard** → Your Project
2. **Click "SQL Editor"** (left sidebar)
3. **Make sure you're logged in as admin** (not a regular user)
4. **Copy and paste** `WORKING_TRIGGER_FIXED.sql`
5. **Click "Run"**

The SQL Editor in Supabase Dashboard runs with service_role permissions, so it will work.

## Alternative: Use Supabase CLI

If you have Supabase CLI set up:
```bash
supabase db reset  # Only if you want to reset
# Or
supabase db push
```

## Verify It Worked

After running, check:
```sql
SELECT * FROM pg_trigger 
WHERE tgname = 'on_auth_user_created_sync_to_public_users';
```

Should show the trigger exists and is enabled.

## If Still Getting Permission Errors

The trigger function uses `SECURITY DEFINER` which should work, but if you're still getting errors:

1. Make sure you're in Supabase Dashboard SQL Editor (not a client tool)
2. The SQL Editor runs with service_role automatically
3. If using a client, you need to connect with service_role key
