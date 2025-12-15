# Collaboration Testing Checklist

**Phase 7: Manual Testing Guide for CRDT, Locks, and Versioning**

This checklist helps verify that all collaboration features work correctly end-to-end.

## Prerequisites

- Two browser windows/tabs (or two different browsers)
- Two different user accounts (or same user in different tabs)
- Development mode enabled (to see debug panel)

## 1. CRDT Sync Testing

### Test: Real-time Text Synchronization

**Steps:**
1. Open the same file in two browser tabs as the same user
2. Type text in Tab A
3. **Expected:** Text appears in Tab B immediately (within ~100ms)

**Steps (Different Users):**
1. Open the same file in two browsers as different users
2. User A types text
3. **Expected:** Text appears in User B's editor immediately

**Verify:**
- Debug panel shows `Collaboration: enabled`
- Debug panel shows `WebSocket: connected`
- No console errors

---

## 2. Lock Behavior Testing

### Test: Lock Acquisition and Read-Only Mode

**Steps:**
1. Tab A opens a file and acquires lock
2. Tab B opens the same file
3. **Expected:**
   - Tab A: Shows "🟢 You are editing (lock active)"
   - Tab B: Shows "🔒 Locked by [user-id]..." and editor is read-only
   - Tab B: Cannot type or edit

**Verify:**
- Debug panel in Tab A shows `Lock Status: LOCKED`
- Debug panel in Tab A shows `Can Edit: true`
- Debug panel in Tab B shows `Lock Status: LOCKED`
- Debug panel in Tab B shows `Can Edit: false`
- Debug panel shows `Locked By: [user-id]`

### Test: Lock Expiration

**Steps:**
1. Tab A acquires lock and edits
2. Close Tab A (or stop sending heartbeats)
3. Wait ~15 seconds
4. Tab B tries to acquire lock
5. **Expected:** Tab B can now acquire the lock

**Verify:**
- Debug panel shows `Expires In: [seconds]` counting down
- After expiration, Tab B can acquire lock

---

## 3. Save Behavior Testing

### Test: Save Creates Version

**Steps:**
1. Open a file in Tab A
2. Make edits
3. Click Save (or Ctrl+S)
4. **Expected:**
   - Save succeeds
   - Debug panel shows `Last Saved Version: [version-id]`
   - Debug panel shows `Last Saved At: [timestamp]`

**Verify:**
- No error messages
- Backend logs show `file_version` record created
- Debug panel updates with new versionId

### Test: Save with Lock Enforcement

**Steps:**
1. Tab A has lock and edits
2. Tab B (without lock) tries to save
3. **Expected:** Error message: "Cannot save: you no longer hold the lock..."

**Verify:**
- Clear error message shown
- Save does not proceed
- File content unchanged

---

## 4. Undo/Redo Testing

### Test: Undo Restores Previous Version

**Steps:**
1. Make three different saves with different content:
   - Save 1: "Content A"
   - Save 2: "Content B"
   - Save 3: "Content C"
2. Use Undo (Ctrl+Z)
3. **Expected:** Content changes to "Content B"
4. Use Undo again
5. **Expected:** Content changes to "Content A"

**Verify:**
- Debug panel shows versionId changes
- Editor content matches previous state
- Other tabs see the restored content via CRDT

### Test: Redo Restores Saved Content

**Steps:**
1. After undoing, use Redo (Ctrl+Y)
2. **Expected:** Content restores to "Content C"

**Verify:**
- Editor content matches saved state
- CRDT syncs to other tabs

---

## 5. Error Cases Testing

### Test: Lock Lost During Edit

**Steps:**
1. Tab A has lock and is editing
2. Tab B (as different user) acquires lock (if owner/admin)
3. Tab A tries to save
4. **Expected:** Error message: "Cannot save: you no longer hold the lock. Please re-acquire the lock and try again."

**Verify:**
- Error message is clear and actionable
- Save does not proceed
- Tab A can re-acquire lock and save again

### Test: API Failure (SBackend Down)

**Steps:**
1. Stop SBackend service
2. Try to save a file
3. **Expected:** Error message: "Service unavailable: the file storage service is not responding. Please try again later."

**Verify:**
- Error message explains the issue
- No data loss (content remains in editor)

### Test: Version Fetch Failure

**Steps:**
1. Save a file successfully
2. Stop backend service
3. Try to undo
4. **Expected:** Error message: "Failed to load previous version. Please try again."

**Verify:**
- Error message is clear
- Editor state unchanged

---

## 6. Debug Panel Verification

### Test: Debug Panel Shows Correct State

**Steps:**
1. Open a file with collaboration enabled
2. Expand debug panel
3. **Expected:** All fields show correct values:
   - Doc ID: `doc:[project-id]:[file-id]`
   - File ID: `[file-uuid]`
   - Project ID: `[project-uuid]`
   - Lock Status: `LOCKED` or `UNLOCKED`
   - Can Edit: `true` or `false`
   - Last Saved Version: `[version-id]` or `N/A`
   - Collaboration: `enabled` or `disabled`
   - WebSocket: `connected`, `disconnected`, `syncing`, or `error`

**Verify:**
- All fields update in real-time
- Values match actual state

---

## 7. Force Reload Version (Dev Tool)

### Test: Reload Last Saved Version

**Steps:**
1. Save a file (note the versionId in debug panel)
2. Make some edits
3. Click "Reload last saved version" in debug panel
4. **Expected:** Editor content restores to last saved version

**Verify:**
- Content matches last saved state
- Y.Doc is updated
- Other tabs see the restored content

---

## Common Issues and Solutions

### Issue: WebSocket shows "disconnected"
- **Check:** Is SBackend WebSocket server running?
- **Check:** Is `NEXT_PUBLIC_WS_URL` set correctly?
- **Solution:** Restart SBackend and check WebSocket endpoint

### Issue: Lock not acquiring
- **Check:** Does user have `canRequestLock` permission?
- **Check:** Is another user holding the lock?
- **Solution:** Check debug panel for lock status

### Issue: Save not creating version
- **Check:** Is backend endpoint `/api/v1/files/{file_id}/save-content` accessible?
- **Check:** Does user hold the lock?
- **Solution:** Check backend logs for errors

### Issue: Undo/Redo not working
- **Check:** Are there previous versions in the database?
- **Check:** Is version API endpoint accessible?
- **Solution:** Check debug panel for last saved versionId

---

## Notes

- All tests should be performed in development mode to see debug panel
- Check browser console for `[Phase 7]` logs
- Backend logs should show version creation and lock operations
- MinIO should show new object versions after each save

