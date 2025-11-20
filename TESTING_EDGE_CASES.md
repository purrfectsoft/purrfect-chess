# Edge Case Handling - Testing & Verification Guide

## Overview

This guide provides step-by-step instructions for testing and verifying the edge case handling implementation for multiplayer chess sessions.

## Quick Start

### Prerequisites

- Two browser tabs or windows
- Chrome/Firefox/Safari (modern browser with localStorage support)
- Dev tools open for console logs

### Test Environment

```bash
# Terminal 1: Start the development server
yarn dev

# Terminal 2 (optional): Run tests
yarn test useBeforeUnload useMultiTabDetection
```

## Automated Tests

### Unit Tests

Run the comprehensive unit test suites:

```bash
# Test tab close detection
yarn test useBeforeUnload

# Test multi-tab detection
yarn test useMultiTabDetection

# Run all tests
yarn test
```

**Expected Results**:
- ✅ useBeforeUnload: 15/15 tests passing
- ✅ useMultiTabDetection: 14/14 tests passing
- ✅ Full suite: 380+ tests passing

## Manual Testing

### Test 1: Tab Close Detection

**Goal**: Verify that closing a tab sends a cleanup message.

**Steps**:
1. Open the app in browser: `http://localhost:3000`
2. Create a multiplayer game room
3. Open browser DevTools → Network tab
4. Enable "Preserve log" in Network tab
5. Close the tab

**Expected Results**:
- ✅ Console log: `[useBeforeUnload] Page unload detected, executing cleanup`
- ✅ Network tab shows sendBeacon request (if server endpoint exists)
- ✅ No errors in console

**Verification**:
```javascript
// Check in browser console before closing
localStorage.getItem('purrfect-chess-tabs:your-session-id')
// Should show tab entry

// In another tab, check after closing first tab
localStorage.getItem('purrfect-chess-tabs:your-session-id')
// Should not show closed tab entry
```

### Test 2: Multi-Tab Detection - Open Second Tab

**Goal**: Verify that opening multiple tabs is detected.

**Steps**:
1. Open app in Tab 1: `http://localhost:3000`
2. Create a multiplayer game room
3. Copy the room URL
4. Open the same room URL in Tab 2
5. Observe both tabs

**Expected Results**:
- ✅ Tab 1: 
  - Console: `[MultiTab] Detected 2 active tabs for session [session-id]`
  - Shows "Primary Tab" indicator (if UI implemented)
- ✅ Tab 2:
  - Console: `[MultiTab] Registering tab [tab-id] for session [session-id]`
  - Shows "Secondary Tab" warning (if UI implemented)
- ✅ Both tabs show correct active tab count

**Verification**:
```javascript
// In browser console (any tab)
const sessionId = 'your-session-id';
const tabs = JSON.parse(localStorage.getItem(`purrfect-chess-tabs:${sessionId}`));
console.log('Active tabs:', Object.keys(tabs).length);
// Should show: 2
```

### Test 3: Multi-Tab Detection - Close Primary Tab

**Goal**: Verify that closing the primary tab promotes the secondary tab.

**Steps**:
1. Have two tabs open (from Test 2)
2. Note which is primary (Tab 1)
3. Close the primary tab (Tab 1)
4. Observe the secondary tab (Tab 2)

**Expected Results**:
- ✅ Tab 2 console: `[MultiTab] Storage event detected, updating tab count`
- ✅ Tab 2 becomes primary tab
- ✅ Active tab count updates to 1
- ✅ No errors in console

### Test 4: Stale Tab Cleanup

**Goal**: Verify that stale tabs are automatically cleaned up.

**Steps**:
1. Open app in Tab 1
2. Create a room
3. Open DevTools → Application → Local Storage
4. Manually add a stale tab entry:
   ```javascript
   const sessionId = 'your-session-id';
   const tabs = JSON.parse(localStorage.getItem(`purrfect-chess-tabs:${sessionId}`));
   tabs['stale-tab'] = Date.now() - 10000; // 10 seconds ago
   localStorage.setItem(`purrfect-chess-tabs:${sessionId}`, JSON.stringify(tabs));
   ```
5. Wait 2 seconds (for heartbeat)
6. Check localStorage again

**Expected Results**:
- ✅ Stale tab entry is removed after heartbeat
- ✅ Only current tab remains
- ✅ Active tab count is 1

### Test 5: Page Refresh

**Goal**: Verify that refreshing the page works correctly.

**Steps**:
1. Open app and create/join a room
2. Make a few moves
3. Refresh the page (F5 or Cmd+R)
4. Observe game state

**Expected Results**:
- ✅ Console: `[useBeforeUnload] Page unload detected, executing cleanup`
- ✅ Page reloads successfully
- ✅ Game state is preserved (via MobX persistence)
- ✅ Reconnection triggers automatically
- ✅ Tab is re-registered in localStorage

### Test 6: Network Disconnection

**Goal**: Verify behavior during network disconnection.

**Steps**:
1. Open app and join a room
2. Make a few moves
3. Open DevTools → Network tab
4. Set throttling to "Offline"
5. Try to make a move
6. Wait a few seconds
7. Set throttling back to "Online"

**Expected Results**:
- ✅ Moves are queued locally while offline
- ✅ Connection status shows "disconnected"
- ✅ When back online, reconnection triggers
- ✅ Queued moves are synchronized
- ✅ No duplicate moves

### Test 7: Concurrent Moves

**Goal**: Verify race condition prevention.

**Steps**:
1. Open room in Tab 1 (player 1)
2. Open same room in Tab 2 (player 2)
3. In Tab 1: Make a move but DON'T submit yet
4. In Tab 2: Make a move immediately
5. In Tab 1: Submit the move you prepared

**Expected Results**:
- ✅ First move received by server is accepted
- ✅ Second move is either:
  - Rejected (if invalid in new position)
  - Queued and applied (if still valid)
- ✅ No duplicate moves in history
- ✅ Both clients converge to same state

### Test 8: Tab Close with Pending Move

**Goal**: Verify behavior when tab is closed mid-move.

**Steps**:
1. Open app and join a room
2. Select a piece but DON'T move it yet
3. Close the tab immediately

**Expected Results**:
- ✅ Cleanup callback executes
- ✅ Leave message sent (if server endpoint exists)
- ✅ Tab removed from localStorage
- ✅ Opponent sees disconnect (if real-time presence works)

## Integration Testing

### Test 9: Full Multiplayer Flow

**Goal**: Test complete multiplayer flow with edge cases.

**Steps**:
1. **Player 1**: Create room → Get room code
2. **Player 2**: Join with room code
3. **Both**: Make several moves
4. **Player 1**: Open duplicate tab → See warning
5. **Player 1**: Close duplicate tab
6. **Player 2**: Disconnect WiFi → Reconnect
7. **Both**: Continue game
8. **Player 1**: Close tab
9. **Player 2**: See disconnect

**Expected Results**:
- ✅ All moves synchronized correctly
- ✅ Multi-tab warning shown
- ✅ Reconnection works seamlessly
- ✅ Tab close detected
- ✅ No errors throughout

## Debugging

### Console Logs to Monitor

Look for these log messages:

**useBeforeUnload**:
```
[useBeforeUnload] Registering beforeunload handler
[useBeforeUnload] Page unload detected, executing cleanup
[useBeforeUnload] Unregistering beforeunload handler
```

**useMultiTabDetection**:
```
[MultiTab] Registering tab [tab-id] for session [session-id]
[MultiTab] Detected N active tabs for session [session-id]
[MultiTab] Storage event detected, updating tab count
[MultiTab] Cleaning up tab [tab-id]
[MultiTab] Removed tab [tab-id] from session [session-id]
```

**Reconnection** (existing):
```
[Reconnection] Reconnection detected, checking if sync is needed
[Reconnection] Requesting full game state for session: [session-id]
[Reconnection] State sync completed successfully
```

### localStorage Inspection

Check localStorage state:

```javascript
// View all purrfect-chess keys
Object.keys(localStorage).filter(k => k.startsWith('purrfect-chess'));

// View tab tracking
const sessionId = 'your-session-id';
const tabs = localStorage.getItem(`purrfect-chess-tabs:${sessionId}`);
console.log('Tab tracking:', JSON.parse(tabs));

// View client ID
console.log('Client ID:', localStorage.getItem('purrfect-chess-client-id'));
```

### Network Monitoring

In DevTools Network tab, look for:

1. **sendBeacon requests** - Tab close cleanup
2. **WebSocket messages** - Realtime move sync
3. **Supabase API calls** - State sync after reconnection

## Performance Testing

### Memory Usage

Monitor memory usage with multiple tabs:

1. Open DevTools → Memory
2. Take a heap snapshot
3. Open 5 tabs for the same room
4. Take another snapshot
5. Compare memory usage

**Expected**: ~10-20KB per additional tab (minimal overhead)

### Network Usage

Monitor network traffic:

1. Open DevTools → Network
2. Create/join a room
3. Make 10 moves
4. Check total data transferred

**Expected**: ~1-2KB per move (including overhead)

## Acceptance Criteria Verification

### ✅ Multi-tab join is handled or blocked

**Test**: Open same room in 2+ tabs  
**Verify**: Detection works, warning shown, strategy enforced

### ✅ Tab close gracefully informs server

**Test**: Close tab with active session  
**Verify**: sendBeacon request sent, no errors

### ✅ Prevent move duplication

**Test**: Make concurrent moves from 2 tabs  
**Verify**: No duplicate moves in history

### ✅ Race condition detection and resolution

**Test**: Simultaneous move attempts  
**Verify**: Server decides order, clients converge

## Known Issues & Limitations

### Browser Limitations

1. **beforeunload reliability**: 
   - May not fire on mobile browsers
   - Background tabs may be terminated without warning
   - **Mitigation**: Server-side TTLs and heartbeats

2. **localStorage limits**:
   - 5-10MB total storage per origin
   - Can be disabled by user
   - **Mitigation**: Graceful fallback, minimal data

3. **sendBeacon size limit**:
   - 64KB per request
   - **Mitigation**: Keep leave messages small

### Edge Cases

1. **Multi-window same origin**: Works as expected
2. **Private browsing**: Storage events may not work
3. **Incognito mode**: Each window has separate storage

## Troubleshooting

### "Tab close not detected"

**Possible causes**:
- Browser killed tab before event fired
- Mobile browser limitation
- Error in callback

**Debug**:
```javascript
// Add logging to callback
useBeforeUnload({
  onBeforeUnload: () => {
    console.log('[Debug] Cleanup executing');
    try {
      navigator.sendBeacon(...);
      console.log('[Debug] sendBeacon succeeded');
    } catch (e) {
      console.error('[Debug] sendBeacon failed:', e);
    }
  }
});
```

### "Multi-tab count wrong"

**Possible causes**:
- Stale tabs not cleaned up
- Storage events not firing
- sessionId mismatch

**Debug**:
```javascript
// Check localStorage directly
const sessionId = 'your-session-id';
const key = `purrfect-chess-tabs:${sessionId}`;
const data = localStorage.getItem(key);
console.log('Raw data:', data);
console.log('Parsed:', JSON.parse(data));

// Check if sessionId matches
console.log('Expected sessionId:', sessionId);
console.log('Actual key:', key);
```

### "Reconnection not working"

**Possible causes**:
- Connection status not updating
- Sequence number tracking issue
- Server connection lost

**Debug**:
```javascript
// Check connection status
console.log('Connection status:', store.multiplayer.connectionStatus);

// Check sequence tracking
console.log('Last sequence:', lastSequenceRef.current);
console.log('Move count:', store.multiplayer.moveCount);
```

## Success Metrics

After testing, verify:

- [ ] All 29 new tests passing
- [ ] No console errors during normal use
- [ ] Tab close detection works 95%+ of time
- [ ] Multi-tab detection works 100% of time
- [ ] No duplicate moves in any scenario
- [ ] Reconnection works after any disconnect
- [ ] Performance acceptable (<100ms overhead)
- [ ] Memory usage minimal (<100KB total)

## Summary

This testing guide covers:

- ✅ Automated unit tests (29 tests)
- ✅ Manual integration tests (9 scenarios)
- ✅ Debugging techniques
- ✅ Performance monitoring
- ✅ Troubleshooting guide
- ✅ Success criteria

Follow these tests to verify that edge case handling works correctly in all scenarios.
