-- 011 Deals v2
-- Upgrade partnerships table for v1 team-based season-long deals.

-- 1. Rename value to total_value
alter table public.partnerships rename column value to total_value;

-- 2. Make deal_type nullable
alter table public.partnerships alter column deal_type drop not null;

-- 3. Add new columns
alter table public.partnerships
  add column if not exists description         text,
  add column if not exists season              text,
  add column if not exists payment_type        text not null default 'one_time',
  add column if not exists payment_terms       text,
  add column if not exists nil_use_description text,
  add column if not exists exclusivity_clause  text,
  add column if not exists requires_opt_in     boolean not null default false,
  add column if not exists proposed_by         uuid references public.profiles (id),
  add column if not exists brand_signed_at     timestamptz,
  add column if not exists team_signed_at      timestamptz,
  add column if not exists brand_display_name  text,
  add column if not exists team_display_name   text;

-- 4. Add check constraints
alter table public.partnerships
  add constraint partnerships_status_check
  check (status in ('draft','pending','active','completed','cancelled'));

alter table public.partnerships
  add constraint partnerships_payment_type_check
  check (payment_type in ('one_time','monthly','per_deliverable'));

alter table public.partnerships
  add constraint partnerships_deal_type_check
  check (deal_type is null or deal_type in ('social_media','events','content_creation','mixed'));

-- 5. Allow team managers to update their deal (accept or decline)
drop policy if exists "Teams can update own partnerships" on public.partnerships;
create policy "Teams can update own partnerships"
  on public.partnerships for update
  using (auth.uid() = team_id);

-- partnership_participants
create table if not exists public.partnership_participants (
  id             uuid primary key default uuid_generate_v4(),
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  athlete_id     uuid not null references public.profiles (id) on delete cascade,
  status         text not null default 'invited'
                 check (status in ('invited','accepted','declined')),
  invited_at     timestamptz not null default now(),
  responded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint partnership_participants_unique unique (partnership_id, athlete_id)
);

create index if not exists partnership_participants_partnership_id_idx
  on public.partnership_participants (partnership_id);
create index if not exists partnership_participants_athlete_id_idx
  on public.partnership_participants (athlete_id);

drop trigger if exists partnership_participants_updated_at on public.partnership_participants;
create trigger partnership_participants_updated_at
  before update on public.partnership_participants
  for each row execute procedure public.handle_updated_at();

alter table public.partnership_participants enable row level security;

drop policy if exists "Athletes can view own participation" on public.partnership_participants;
create policy "Athletes can view own participation"
  on public.partnership_participants for select using (auth.uid() = athlete_id);

drop policy if exists "Athletes can update own participation" on public.partnership_participants;
create policy "Athletes can update own participation"
  on public.partnership_participants for update using (auth.uid() = athlete_id);

drop policy if exists "Teams can view participation" on public.partnership_participants;
create policy "Teams can view participation"
  on public.partnership_participants for select
  using (
    exists (
      select 1 from public.partnerships p
      where p.id = partnership_participants.partnership_id
        and p.team_id = auth.uid()
    )
  );

drop policy if exists "Brands can manage participation" on public.partnership_participants;
create policy "Brands can manage participation"
  on public.partnership_participants for all
  using (
    exists (
      select 1 from public.partnerships p
      where p.id = partnership_participants.partnership_id
        and p.brand_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
