-- ============================================================================
-- Session Cleanup Script
-- ============================================================================
-- Purpose: Clean up inactive, expired, and old sessions from the database
-- Usage: Run manually or schedule as a periodic job (e.g., daily)
-- ============================================================================

-- ============================================================================
-- 1. Mark Inactive Sessions as Expired
-- ============================================================================
-- Sessions that have been inactive for more than 24 hours are marked as expired
-- This applies to sessions in 'waiting' or 'active' state

UPDATE sessions
SET 
    state = 'expired',
    updated_at = NOW()
WHERE 
    state IN ('waiting', 'active')
    AND updated_at < NOW() - INTERVAL '24 hours';

-- Log the number of sessions marked as expired
DO $$
DECLARE
    expired_count INTEGER;
BEGIN
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RAISE NOTICE 'Marked % inactive sessions as expired', expired_count;
END $$;

-- ============================================================================
-- 2. Clean Up Old Completed/Abandoned Sessions
-- ============================================================================
-- Delete sessions that have been completed, abandoned, or expired for more
-- than 30 days. This includes all associated moves and data.

-- Note: Cascade deletes will remove associated moves due to FK constraints
DELETE FROM sessions
WHERE 
    state IN ('completed', 'abandoned', 'expired')
    AND updated_at < NOW() - INTERVAL '30 days';

-- Log the number of sessions deleted
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % old sessions', deleted_count;
END $$;

-- ============================================================================
-- 3. Clean Up Orphaned Moves (Optional Safety Check)
-- ============================================================================
-- In case there are any orphaned moves (moves without a parent session),
-- clean them up. This should not happen due to FK constraints, but it's
-- a safety measure.

DELETE FROM moves
WHERE session_id NOT IN (SELECT id FROM sessions);

-- Log the number of orphaned moves deleted
DO $$
DECLARE
    orphaned_count INTEGER;
BEGIN
    GET DIAGNOSTICS orphaned_count = ROW_COUNT;
    IF orphaned_count > 0 THEN
        RAISE NOTICE 'Deleted % orphaned moves', orphaned_count;
    END IF;
END $$;

-- ============================================================================
-- 4. Update Statistics (Optional)
-- ============================================================================
-- Update table statistics for better query performance

ANALYZE sessions;
ANALYZE moves;

RAISE NOTICE 'Cleanup complete. Statistics updated.';

-- ============================================================================
-- Scheduling Options
-- ============================================================================
-- This script can be scheduled to run automatically using:
--
-- Option 1: Supabase Edge Functions (Recommended)
-- Create an edge function that runs this SQL on a schedule via Deno Cron
--
-- Option 2: pg_cron Extension
-- If available, use pg_cron to schedule this as a PostgreSQL job:
--
-- SELECT cron.schedule(
--   'cleanup-sessions',
--   '0 2 * * *', -- Run daily at 2 AM
--   $$ 
--     -- Paste the cleanup SQL here
--   $$
-- );
--
-- Option 3: External Cron Job
-- Set up a cron job on your server that calls this SQL via psql or API
--
-- Option 4: GitHub Actions (for development)
-- Schedule a GitHub Action to call the Supabase API with this SQL
-- ============================================================================

-- ============================================================================
-- Monitoring Query
-- ============================================================================
-- Use this query to check the status of sessions before/after cleanup:
--
-- SELECT 
--     state,
--     COUNT(*) as count,
--     MIN(updated_at) as oldest,
--     MAX(updated_at) as newest
-- FROM sessions
-- GROUP BY state
-- ORDER BY state;
-- ============================================================================
