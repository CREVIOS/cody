# Authentication & Demo Mode Implementation

This document explains how Supabase Auth and demo mode coexist in the application.

## Overview

The application supports two modes:
1. **Auth Mode**: Uses Supabase Email + Password authentication
2. **Demo Mode**: Uses existing users from `public.users` table without authentication

Both modes can coexist, but exactly one `userId` is active at a time.

## Context Structure

### AuthContext (`app/context/AuthContext.tsx`)

Provides Supabase authentication state and methods:

```typescript
interface AuthContextType {
  user: SupabaseUser | null;           // Supabase auth user object
  userId: string | null;                // user?.id or null
  isAuthenticated: boolean;             // true if user is authenticated
  loading: boolean;                     // true during auth initialization
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
```

**Usage:**
```typescript
import { useAuth } from "@/context/AuthContext";

function MyComponent() {
  const { user, userId, isAuthenticated, signIn, signOut } = useAuth();
  // ...
}
```

### useActiveUserId Hook (`app/hooks/useActiveUserId.ts`)

Resolves the active user ID with priority: **Auth userId > Demo userId**

```typescript
// Get active user ID
const activeUserId = useActiveUserId(); // Returns auth userId or demoUserId

// Set demo mode
import { setDemoUserId } from "@/hooks/useActiveUserId";
setDemoUserId(userId); // Sets demo mode with userId

// Clear demo mode
import { clearDemoMode } from "@/hooks/useActiveUserId";
clearDemoMode(); // Removes demo mode
```

**Priority Logic:**
1. If authenticated via Supabase → use `authUserId`
2. If in demo mode → use `demoUserId` (from localStorage)
3. Otherwise → return `null`

## How Demo Mode is Toggled

### Entering Demo Mode

1. User visits the app and sees `UserSelection` component
2. User clicks on a user card (from `public.users` table)
3. `handleSelectUserDemo` is called:
   ```typescript
   const handleSelectUserDemo = (user: User) => {
     setDemoUserId(user.user_id);  // Sets demo mode
     onSelectUser(user);            // Updates UI state
   };
   ```
4. Demo user ID is stored in localStorage: `app-demo-user-id`

### Exiting Demo Mode

Demo mode is automatically cleared when:
- User authenticates via Supabase (auth takes priority)
- User explicitly logs out (calls `clearDemoMode()`)

### Demo Mode Button

The `UserSelection` component includes:
- **Log In** button → redirects to `/auth/login`
- **Sign Up** button → redirects to `/auth/signup`
- User cards → clicking enters demo mode with that user

## How activeUserId is Resolved

The `useActiveUserId` hook implements the following logic:

```typescript
export function useActiveUserId(): string | null {
  const { userId: authUserId, isAuthenticated } = useAuth();
  const [demoUserId, setDemoUserIdState] = useState<string | null>(null);
  
  // Load demo user ID from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("app-demo-user-id");
    if (stored) setDemoUserIdState(stored);
  }, []);
  
  // Clear demo mode when auth becomes active
  useEffect(() => {
    if (isAuthenticated && authUserId && demoUserId) {
      localStorage.removeItem("app-demo-user-id");
      setDemoUserIdState(null);
    }
  }, [isAuthenticated, authUserId, demoUserId]);
  
  // Priority: auth > demo
  if (isAuthenticated && authUserId) {
    return authUserId;
  }
  return demoUserId;
}
```

**Flow:**
1. Hook loads demo user ID from localStorage
2. If authenticated, returns auth userId (and clears demo mode)
3. If not authenticated, returns demo userId
4. Returns `null` if neither is active

## Example API Call Showing user_id

### Using fetchWithUserId Helper

The `fetchWithUserId` function automatically adds `user_id` to API requests:

```typescript
import { fetchWithUserId } from "@/lib/projectAPI/APIConfiguration";
import { useActiveUserId } from "@/hooks/useActiveUserId";

function MyComponent() {
  const activeUserId = useActiveUserId();
  
  const createProject = async (projectData: any) => {
    // fetchWithUserId automatically adds { user_id: activeUserId } to request body
    const response = await fetchWithUserId(
      `${API_BASE_URL}/api/v1/projects/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData),
      },
      activeUserId  // Automatically merged into request body
    );
  };
}
```

### Request Body Example

When `fetchWithUserId` is called with:
```typescript
body: JSON.stringify({ project_name: "My Project", owner_id: "123" }),
userId: "abc-123"
```

The actual request body sent to backend:
```json
{
  "project_name": "My Project",
  "owner_id": "123",
  "user_id": "abc-123"
}
```

### Real Example: createProject

See `app/lib/projectAPI/ProjectAPI.tsx`:

```typescript
export const createProject = async (
  projectData: { project_name: string; owner_id: string; ... },
  userId: string | null
): Promise<Project> => {
  const response = await fetchWithUserId(
    `${API_BASE_URL}/api/v1/projects/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData),
    },
    userId  // Automatically adds { user_id: userId } to body
  );
  // ...
};
```

**Usage in component:**
```typescript
import { useActiveUserId } from "@/hooks/useActiveUserId";
import { createProject } from "@/lib/projectAPI/ProjectAPI";

const activeUserId = useActiveUserId();
await createProject(projectData, activeUserId);
```

## Pages

### Signup Page (`app/auth/signup/page.tsx`)
- Email + password form
- Uses `signUp` from AuthContext
- Redirects to `/` on success

### Login Page (`app/auth/login/page.tsx`)
- Email + password form
- Uses `signIn` from AuthContext
- Redirects to `/` on success

## App Behavior Rules

1. **Exactly one userId active**: Either auth userId OR demo userId, never both
2. **Auth takes priority**: If authenticated, demo mode is automatically cleared
3. **No JWT verification**: Backend trusts `user_id` sent in requests
4. **No auth enforcement**: Middleware allows demo mode (no redirect to login)

## Integration Points

### Main App (`app/page.tsx`)
- Uses `useAuth()` to check authentication
- Uses `useActiveUserId()` to get active user ID
- Fetches user from `public.users` when authenticated
- Falls back to demo mode if not authenticated

### UserSelection Component
- Shows users from `public.users` table
- Provides "Log In" and "Sign Up" buttons
- Clicking a user enters demo mode

### API Calls
- Use `fetchWithUserId()` helper to automatically include `user_id`
- Or manually add `user_id` to request body/query params

## Storage Keys

- `app-demo-user-id`: Stores demo user ID in localStorage
- `app-selected-user`: Stores selected user object (for UI state)
- Supabase auth: Stored in cookies by Supabase SDK

## Important Notes

1. **Supabase Auth users and public.users coexist**: They are separate systems
2. **No automatic user creation**: When a user signs up via Supabase, they may need to be created in `public.users` separately (if required by your backend)
3. **Backend trusts user_id**: No JWT verification is implemented
4. **Demo mode is persistent**: Demo user ID persists across page refreshes until cleared
