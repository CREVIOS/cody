# Realtime Cursors Setup Guide

## Prerequisites

- Supabase project with Realtime enabled
- Environment variables configured
- Multiple users in the same project

## Environment Configuration

Create a `.env.local` file in your Frontend directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## How It Works

### 1. **Room Isolation**

- Each project gets its own cursor room: `project-{projectId}`
- Users only see cursors from others in the same project
- No cross-project cursor sharing

### 2. **User Identification**

- Cursors are identified by user's `full_name` or `username`
- Each user gets a random color assigned automatically
- Users don't see their own cursor (filtered out)

### 3. **Real-time Features**

- **Throttling**: Mouse movements are throttled to 50ms (configurable)
- **Cleanup**: Stale cursors disappear after 5 seconds (configurable)
- **Smooth Animation**: CSS transitions for smooth cursor movement

## Testing Steps

### Step 1: Single User Setup

1. Open your project in the browser
2. Check browser dev tools console for any errors
3. Move your mouse around - you shouldn't see your own cursor

### Step 2: Multi-User Testing

1. **Option A - Different Browsers:**

   - Open same project in Chrome and Firefox
   - Login as different users
   - Move mouse in one browser, see cursor in the other

2. **Option B - Incognito Mode:**

   - Open project in normal browser
   - Open same project in incognito mode
   - Login as different users

3. **Option C - Different Devices:**
   - Open project on your computer
   - Open same project on your phone/tablet
   - Login as different users

### Step 3: Verify Functionality

- ✅ See other users' cursors with their names
- ✅ Cursors have different colors
- ✅ Smooth cursor movement
- ✅ Cursors disappear when users leave
- ✅ No cross-project cursor sharing

## Troubleshooting

### No Cursors Showing

- Check browser dev tools console for errors
- Verify environment variables are set correctly
- Ensure Supabase Realtime is enabled
- Check that users are in the same project

### Cursors Not Smooth

- Increase throttle time in RealtimeCursors component
- Check network connection
- Verify Supabase project region is close to users

### Performance Issues

- Reduce throttle time (increase from 50ms to 100ms)
- Increase stale timeout (reduce cleanup frequency)
- Check if too many users in same project

## Configuration Options

You can customize the RealtimeCursors component:

```tsx
<RealtimeCursors
  roomName={`project-${projectId}`}
  username={user.full_name || user.username}
  throttleMs={50} // How often to send cursor updates
  staleTimeout={5000} // How long until cursor disappears
/>
```

## Advanced Features

### Custom Cursor Colors

The system automatically assigns random colors, but you can modify the `generateRandomColor()` function in `use-realtime-cursors.ts` to:

- Use consistent colors per user
- Match your app's color scheme
- Use user avatars or custom icons

### Cursor Persistence

Currently cursors disappear after 5 seconds of inactivity. You can:

- Increase stale timeout for longer persistence
- Add presence detection to show "user is typing" indicators
- Sync cursor positions with user status

## Security Notes

- Cursor positions are broadcast to all users in the same project room
- No sensitive data is shared through cursor positions
- Room names are based on project IDs for proper isolation
- Users can only see cursors from projects they have access to
