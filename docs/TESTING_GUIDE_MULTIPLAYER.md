# Manual Testing Guide: Multiplayer Race Condition Fix

This guide provides step-by-step instructions for manually testing the multiplayer race condition fix.

## Prerequisites

- Two separate browser windows or two different browsers
- Access to the application (local dev server or deployed environment)
- Supabase database access for verification (optional)

## Test Scenario 1: Simultaneous Room Join (Primary Test)

### Objective
Verify that when two players join a room at nearly the same time, both are correctly assigned different colors.

### Steps

1. **Open Two Browser Windows**
   - Window A: Main browser (e.g., Chrome)
   - Window B: Incognito mode OR different browser (e.g., Firefox)

2. **Create Room in Browser A**
   - Navigate to the application
   - Enter display name: "Player A"
   - Click "Create New Room"
   - Note the Room ID (e.g., "ABCD-1234")
   - **Expected:** Shows "Players (1/2)" with "Player A (you)"

3. **Join Room in Browser B (Quickly!)**
   - Navigate to the application
   - Enter display name: "Player B"
   - Click "Join Existing Room"
   - Enter the Room ID from step 2
   - Click "Join Room"
   - ⏱️ Try to do this within 1-2 seconds of room creation

4. **Verify Browser A**
   - **Expected:** Shows "Players (2/2)"
   - **Expected:** Lists two players:
     - "Player A (white) (you)" 🟢
     - "Player B (black)" 🟢
   - **Expected:** Session status shows "active"
   - **Expected:** Connection badge shows "connected" 🟢

5. **Verify Browser B**
   - **Expected:** Shows "Players (2/2)"
   - **Expected:** Lists two players:
     - "Player A (white)" 🟢
     - "Player B (black) (you)" 🟢
   - **Expected:** Session status shows "active"
   - **Expected:** Connection badge shows "connected" 🟢

### Success Criteria

✅ Both browsers show exactly 2 players
✅ Player A assigned white in both browsers
✅ Player B assigned black in both browsers
✅ No player sees themselves duplicated
✅ Connection status remains stable (no flickering)
✅ Session state transitions to "active"

### Failure Indicators

❌ One or both browsers show "Players (1/2)"
❌ Both players assigned the same color
❌ One player is missing from the list
❌ Connection status toggles between connecting/connected
❌ Session state stuck on "waiting"

## Test Scenario 2: Rapid Sequential Joins

### Objective
Test that even with very fast sequential joins (not truly simultaneous), assignment works correctly.

### Steps

1. **Open Three Browser Windows**
   - Window A, B, C

2. **Create Room in Browser A**
   - Display name: "Player A"
   - Note Room ID

3. **Join in Browser B Immediately**
   - Display name: "Player B"
   - Join using Room ID
   - **Expected:** Assigned black (since A is white)

4. **Attempt Join in Browser C**
   - Display name: "Player C"
   - Try to join using same Room ID
   - **Expected:** Error message "Room is full"
   - **Expected:** Player C NOT added to room

### Success Criteria

✅ First two players assigned correctly (white, black)
✅ Third player cannot join (room full)
✅ No errors in console
✅ Existing players unaffected by third join attempt

## Test Scenario 3: Reconnection After Disconnect

### Objective
Verify that if a player disconnects and reconnects, they retain their original color assignment.

### Steps

1. **Create and Join Room**
   - Browser A: Create room as "Player A"
   - Browser B: Join room as "Player B"
   - Verify both assigned correctly

2. **Disconnect Player B**
   - In Browser B: Close tab or click "Leave Room"
   - Verify Browser A shows Player B as offline ⚫

3. **Reconnect Player B**
   - In Browser B: Reopen application
   - Use same display name: "Player B"
   - Join using same Room ID
   - **Expected:** Reassigned to same color (black)

4. **Verify**
   - Browser A: Shows Player B back online 🟢
   - Browser B: Shows same color as before
   - No duplicate players
   - Session state still "active"

### Success Criteria

✅ Player retains original color after reconnection
✅ No duplicate player entries
✅ Connection status updates correctly
✅ Other player's view updates (offline → online)

## Test Scenario 4: Database Verification (Optional)

### Objective
Directly verify database state to confirm atomic assignment.

### Prerequisites
- Access to Supabase dashboard or database client
- SQL query access

### Steps

1. **Create and Join Room**
   - Follow Test Scenario 1 steps

2. **Query Database**
   ```sql
   SELECT 
     id,
     room_id,
     white_player_id,
     black_player_id,
     state,
     started_at
   FROM sessions
   WHERE room_id = 'ABCD-1234'  -- Replace with actual room ID
   ORDER BY created_at DESC
   LIMIT 1;
   ```

3. **Verify Results**
   - **Expected:** `white_player_id` is NOT NULL
   - **Expected:** `black_player_id` is NOT NULL
   - **Expected:** `white_player_id` ≠ `black_player_id`
   - **Expected:** `state` = 'active'
   - **Expected:** `started_at` is set

### Success Criteria

✅ Both player IDs are populated
✅ Player IDs are different (not duplicated)
✅ Session state is 'active'
✅ Timestamp shows both players joined

## Test Scenario 5: Stress Test (Advanced)

### Objective
Test with multiple rapid join attempts to stress the locking mechanism.

### Tools Needed
- Browser DevTools Console
- Multiple browser tabs (5-10)

### Steps

1. **Create Room in Browser A**
   - Note Room ID

2. **Prepare Multiple Browsers**
   - Open 5-10 incognito tabs
   - Navigate all to the application
   - Prepare to join the same room

3. **Rapid Join Attempts**
   - In each tab, enter Room ID
   - Click "Join Room" in all tabs as fast as possible
   - Goal: Simulate 10 near-simultaneous join attempts

4. **Verify Results**
   - **Expected:** Only 2 players total in the room
   - **Expected:** First 2 to join get assigned (white, black)
   - **Expected:** Remaining 8 get "Room is full" error
   - **Expected:** No duplicate assignments
   - **Expected:** No database errors in console

### Success Criteria

✅ Exactly 2 players assigned
✅ No duplicates or overwrites
✅ Excess join attempts rejected gracefully
✅ No database lock timeout errors
✅ System remains stable

## Debugging Failed Tests

### If "Players (1/2)" Appears

1. **Check Browser Console**
   ```
   [RoomManager] Player assigned as: <color>
   [RoomManager] Session state: <state>
   ```
   - Verify color assignment logged
   - Check for RPC errors

2. **Check Network Tab**
   - Look for `assign_player_to_session` RPC call
   - Verify it returns success (200 OK)
   - Check response payload has `color` and `session`

3. **Check Realtime Connection**
   ```
   [Realtime] Successfully subscribed to room:<roomId>
   [Realtime] Tracking presence: {...}
   ```
   - Verify presence tracking succeeded
   - Check broadcast messages sent

### If Both Players Have Same Color

1. **Database Check**
   - Query session row
   - Verify both `white_player_id` and `black_player_id` are set
   - If both are same → race condition NOT fixed

2. **Function Check**
   - Verify `assign_player_to_session` function exists in database
   - Check function definition includes `FOR UPDATE`
   - Verify function logic is correct

### If Connection Flaps

1. **Check Realtime Status**
   - Look for subscription timeout errors
   - Verify channel manager properly initialized
   - Check presence state includes all required fields

2. **Check Reconnection Logic**
   - Verify reconnection attempts in console
   - Check if manual reconnect button works

## Performance Verification

### Expected Timings
- Room creation: < 500ms
- Player assignment: < 100ms
- Presence update: < 50ms
- Total join flow: < 1 second

### Console Logs to Monitor
```
[RoomManager] Calling atomic assign_player_to_session for player <id>
[RoomManager] Player assigned as: <color>
[useMultiplayer] Presence updated: {...}
[Realtime] Broadcasted player_join to room:<id>
```

## Success Summary

After completing all tests, the fix is verified if:

1. ✅ **Test 1 (Simultaneous Join):** Both players assigned correctly
2. ✅ **Test 2 (Rapid Sequential):** Third player rejected, first two assigned
3. ✅ **Test 3 (Reconnection):** Player retains color on reconnect
4. ✅ **Test 4 (Database):** Both player IDs populated correctly
5. ✅ **Test 5 (Stress):** System handles multiple rapid joins without errors

If ANY test fails, the race condition may still exist or there's a new bug.

## Rollback Procedure

If critical bugs are found:

1. **Quick Fix:** Disable multiplayer feature temporarily
2. **Database:** Keep `assign_player_to_session` function (harmless)
3. **Frontend:** Revert to previous commit
4. **Investigate:** Check console logs and database state
5. **Report:** Document exact failure scenario

## Additional Notes

- All tests assume Supabase Realtime is operational
- Tests require network connectivity
- Browser caching may affect results (use incognito/private mode)
- Database latency may affect simultaneous join timing
- Test in production-like environment for best results

## Contact

For issues or questions about this test guide:
- Check: `docs/MULTIPLAYER_RACE_CONDITION_FIX.md`
- Review: Console logs in browser DevTools
- Inspect: Network tab for RPC calls
- Query: Database for session state
