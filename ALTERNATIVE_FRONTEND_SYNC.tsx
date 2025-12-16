// ============================================================================
// ALTERNATIVE: If trigger doesn't work, sync from frontend after signup
// ============================================================================
// Add this to your AuthContext signUp function

import { createClient } from "@/lib/supabase/client";

// Add this function to sync user after signup
async function syncUserToPublicUsers(authUserId: string, email: string) {
  const supabase = createClient();
  
  try {
    // Call a Supabase Edge Function or direct API to sync
    // Option 1: Use Supabase RPC (if you create a function)
    const { data, error } = await supabase.rpc('sync_auth_user', {
      auth_user_id: authUserId
    });
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to sync user:', error);
    // Fallback: Call your backend API
    try {
      const response = await fetch('/api/v1/users/sync-from-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: authUserId, email })
      });
      if (!response.ok) throw new Error('Sync failed');
    } catch (apiError) {
      console.error('Backend sync also failed:', apiError);
    }
  }
}

// Then in your signUp function, after successful signup:
const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  if (data.user) {
    setUser(data.user);
    // Sync to public.users immediately after signup
    await syncUserToPublicUsers(data.user.id, email);
  }
};
