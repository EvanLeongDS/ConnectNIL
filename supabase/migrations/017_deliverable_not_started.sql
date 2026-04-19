-- Rename the initial deliverable status from 'pending' to 'not_started'
-- so it's clear the athlete hasn't begun work yet vs. submitted-and-waiting.

-- Change the column default
ALTER TABLE public.deliverables ALTER COLUMN status SET DEFAULT 'not_started';

-- Backfill: any deliverable still at 'pending' (never submitted) → 'not_started'
UPDATE public.deliverables SET status = 'not_started' WHERE status = 'pending';
