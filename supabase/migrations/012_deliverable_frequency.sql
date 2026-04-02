-- Cadence for deliverables: one-off vs recurring (daily / weekly / monthly / whole season).

alter table public.deliverables
  add column if not exists frequency text not null default 'one_time';

alter table public.deliverables
  drop constraint if exists deliverables_frequency_check;

alter table public.deliverables
  add constraint deliverables_frequency_check
  check (frequency in ('one_time', 'daily', 'weekly', 'monthly', 'season'));

notify pgrst, 'reload schema';
