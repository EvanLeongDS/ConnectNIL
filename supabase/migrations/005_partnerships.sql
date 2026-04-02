-- ─── Partnerships ────────────────────────────────────────────────────────────
-- A partnership links a brand to either an athlete OR a team (not both).

create table public.partnerships (
  id            uuid primary key default uuid_generate_v4(),
  brand_id      uuid not null references public.profiles (id) on delete cascade,
  athlete_id    uuid references public.profiles (id) on delete set null,
  team_id       uuid references public.profiles (id) on delete set null,
  title         text not null,
  deal_type     text not null,          -- social_media | events | content_creation
  status        text not null default 'pending',  -- pending | active | completed | cancelled
  value         numeric(12, 2),
  currency      text not null default 'USD',
  start_date    date,
  end_date      date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint partnerships_target_check
    check (athlete_id is not null or team_id is not null)
);

create trigger partnerships_updated_at
  before update on public.partnerships
  for each row execute procedure public.handle_updated_at();

create index partnerships_brand_id_idx   on public.partnerships (brand_id);
create index partnerships_athlete_id_idx on public.partnerships (athlete_id);
create index partnerships_team_id_idx    on public.partnerships (team_id);

-- ─── Deliverables ────────────────────────────────────────────────────────────
-- Each deliverable belongs to a partnership.

create table public.deliverables (
  id              uuid primary key default uuid_generate_v4(),
  partnership_id  uuid not null references public.partnerships (id) on delete cascade,
  title           text not null,
  description     text,
  due_date        date,
  status          text not null default 'pending',  -- pending | submitted | approved | rejected
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger deliverables_updated_at
  before update on public.deliverables
  for each row execute procedure public.handle_updated_at();

create index deliverables_partnership_id_idx on public.deliverables (partnership_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.partnerships enable row level security;
alter table public.deliverables  enable row level security;

-- Brands see their own partnerships
create policy "Brands can view own partnerships"
  on public.partnerships for select
  using (auth.uid() = brand_id);

create policy "Brands can insert own partnerships"
  on public.partnerships for insert
  with check (auth.uid() = brand_id);

create policy "Brands can update own partnerships"
  on public.partnerships for update
  using (auth.uid() = brand_id);

-- Athletes see partnerships they're a part of
create policy "Athletes can view own partnerships"
  on public.partnerships for select
  using (auth.uid() = athlete_id);

-- Team managers see partnerships their team is a part of
create policy "Teams can view own partnerships"
  on public.partnerships for select
  using (auth.uid() = team_id);

-- Deliverables: visible to all participants of the partnership
create policy "Partnership participants can view deliverables"
  on public.deliverables for select
  using (
    exists (
      select 1 from public.partnerships p
      where p.id = deliverables.partnership_id
        and (p.brand_id = auth.uid() or p.athlete_id = auth.uid() or p.team_id = auth.uid())
    )
  );

create policy "Brands can manage deliverables"
  on public.deliverables for all
  using (
    exists (
      select 1 from public.partnerships p
      where p.id = deliverables.partnership_id
        and p.brand_id = auth.uid()
    )
  );
