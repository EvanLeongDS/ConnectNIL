-- Constrain deliverables.status to a known vocabulary.
--
-- Migration 017 renamed the initial status 'pending' -> 'not_started', changed the column
-- DEFAULT and backfilled existing rows. What it could not do is stop the value drifting
-- again: the column has never had a CHECK constraint (005_partnerships.sql), and both
-- insert paths went on writing the literal 'pending' regardless of the new DEFAULT. So the
-- table now holds BOTH values for the same meaning, and every UI predicate that tested
-- `status === 'pending'` silently stopped matching the rows 017 had rewritten -- which is
-- why no Submit-proof button rendered and the athlete Deliverables page showed four zeros.
--
-- This migration deliberately does NOT rewrite rows. The application predicates
-- (isAwaitingSubmission / isNotStarted in lib/deals/types.ts) accept both spellings, so
-- mixed data is already correct and a rewrite would be risk without benefit. The writers
-- were fixed in the same change, so the legacy value stops accumulating from here.

alter table public.deliverables
  drop constraint if exists deliverables_status_check;

-- 'pending' is included ON PURPOSE. It is the legacy spelling of 'not_started' and live
-- rows still carry it: a four-value set would fail to install while any of them exist, and
-- would 500 every deal proposal if the application code were rolled back. The tolerant
-- predicates make the duplicate harmless.
--
-- A future migration may drop it once
--   select count(*) from public.deliverables where status = 'pending';
-- is zero and has stayed zero across a full deploy cycle.
alter table public.deliverables
  add constraint deliverables_status_check
  check (status in ('not_started', 'pending', 'submitted', 'approved', 'rejected'));

comment on column public.deliverables.status is
  'not_started | pending | submitted | approved | rejected. ''pending'' is the legacy spelling of ''not_started'' (see migration 017) and means the same thing - test it with isAwaitingSubmission/isNotStarted from lib/deals/types.ts, never with an equality check against one literal.';

notify pgrst, 'reload schema';
