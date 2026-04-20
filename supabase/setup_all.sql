-- ============================================================================
-- ConnectNIL — FULL DATABASE SETUP (run this once in Supabase SQL Editor)
-- ============================================================================
-- Safe to re-run: uses IF NOT EXISTS and OR REPLACE everywhere.

-- Extensions
create extension if not exists "uuid-ossp";

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text,
  full_name           text,
  avatar_url          text,
  stripe_customer_id  text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.profiles enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='Users can view own profile') then
    create policy "Users can view own profile" on public.profiles for select using (auth.uid()=id);
  end if;
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='Users can update own profile') then
    create policy "Users can update own profile" on public.profiles for update using (auth.uid()=id);
  end if;
end $$;

-- ─── Subscriptions ───────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references public.profiles (id) on delete cascade,
  stripe_subscription_id  text unique not null,
  stripe_customer_id      text not null,
  status                  text not null,
  price_id                text not null,
  current_period_start    timestamptz not null,
  current_period_end      timestamptz not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='subscriptions' and policyname='Users can view own subscription') then
    create policy "Users can view own subscription" on public.subscriptions for select using (auth.uid()=user_id);
  end if;
end $$;

-- ─── Athlete Profiles ────────────────────────────────────────────────────────
drop table if exists public.athlete_profiles cascade;
create table public.athlete_profiles (
  id                    uuid primary key references public.profiles (id) on delete cascade,
  first_name            text not null,
  last_name             text not null,
  phone                 text not null,
  school                text not null,
  graduation_year       int not null,
  sport                 text not null,
  team                  text not null,
  bio                   text,
  instagram_handle      text,
  tiktok_handle         text,
  twitter_handle        text,
  snapchat_handle       text,
  instagram_followers   int,
  tiktok_followers      int,
  twitter_followers     int,
  snapchat_followers    int,
  onboarding_complete   boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger athlete_profiles_updated_at
  before update on public.athlete_profiles
  for each row execute procedure public.handle_updated_at();

alter table public.athlete_profiles enable row level security;
create policy "Athletes can view own profile"  on public.athlete_profiles for select using (auth.uid()=id);
create policy "Athletes can insert own profile" on public.athlete_profiles for insert with check (auth.uid()=id);
create policy "Athletes can update own profile" on public.athlete_profiles for update using (auth.uid()=id);

-- ─── Brand Profiles ─────────────────────────────────────────────────────────
drop table if exists public.brand_profiles cascade;
create table public.brand_profiles (
  id                    uuid primary key references public.profiles (id) on delete cascade,
  company_name          text not null,
  first_name            text not null,
  last_name             text not null,
  phone                 text,
  city                  text not null,
  state                 text not null,
  industry              text not null,
  budget_range          text not null,
  company_description   text not null,
  team_description      text,
  target_audience       text[] not null,
  preferred_sports      text[],
  preferred_schools     text[],
  campaign_types        text[],
  website_url           text,
  social_instagram      text,
  social_x              text,
  social_linkedin       text,
  onboarding_complete   boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger brand_profiles_updated_at
  before update on public.brand_profiles
  for each row execute procedure public.handle_updated_at();

alter table public.brand_profiles enable row level security;
create policy "Brands can view own profile"  on public.brand_profiles for select using (auth.uid()=id);
create policy "Brands can insert own profile" on public.brand_profiles for insert with check (auth.uid()=id);
create policy "Brands can update own profile" on public.brand_profiles for update using (auth.uid()=id);

-- ─── Team Profiles ──────────────────────────────────────────────────────────
drop table if exists public.team_profiles cascade;
create table public.team_profiles (
  id                    uuid primary key references public.profiles (id) on delete cascade,
  school                text not null,
  team_name             text not null,
  sport                 text not null,
  division              text,
  num_players           int not null,
  manager_first_name    text not null,
  manager_last_name     text not null,
  phone                 text not null,
  athlete_emails        text[] not null default '{}',
  interested_brands     text[] not null default '{}',
  preferred_deals       text[] not null default '{}',
  availability          text not null,
  onboarding_complete   boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger team_profiles_updated_at
  before update on public.team_profiles
  for each row execute procedure public.handle_updated_at();

alter table public.team_profiles enable row level security;
create policy "Team managers can view own profile"  on public.team_profiles for select using (auth.uid()=id);
create policy "Team managers can insert own profile" on public.team_profiles for insert with check (auth.uid()=id);
create policy "Team managers can update own profile" on public.team_profiles for update using (auth.uid()=id);

-- ─── Team athlete invitations ─────────────────────────────────────────────────
create table if not exists public.team_athlete_invitations (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references public.team_profiles (id) on delete cascade,
  email text not null,
  token text not null unique,
  email_sent_at timestamptz,
  opened_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_athlete_invitations_team_email_unique unique (team_id, email)
);

create index if not exists team_athlete_invitations_team_id_idx on public.team_athlete_invitations (team_id);

drop trigger if exists team_athlete_invitations_updated_at on public.team_athlete_invitations;
create trigger team_athlete_invitations_updated_at
  before update on public.team_athlete_invitations
  for each row execute procedure public.handle_updated_at();

alter table public.team_athlete_invitations enable row level security;

drop policy if exists "Team managers read own athlete invitations" on public.team_athlete_invitations;
create policy "Team managers read own athlete invitations"
  on public.team_athlete_invitations for select
  using (team_id = auth.uid());

drop policy if exists "Team managers insert own athlete invitations" on public.team_athlete_invitations;
create policy "Team managers insert own athlete invitations"
  on public.team_athlete_invitations for insert
  with check (team_id = auth.uid());

drop policy if exists "Team managers update own athlete invitations" on public.team_athlete_invitations;
create policy "Team managers update own athlete invitations"
  on public.team_athlete_invitations for update
  using (team_id = auth.uid())
  with check (team_id = auth.uid());

drop policy if exists "Team managers delete own athlete invitations" on public.team_athlete_invitations;
create policy "Team managers delete own athlete invitations"
  on public.team_athlete_invitations for delete
  using (team_id = auth.uid());

-- ─── Discovery interests (team ↔ brand signals from Discover) ───────────────
create table if not exists public.discovery_interests (
  id uuid primary key default uuid_generate_v4(),
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewer_role text not null check (viewer_role in ('team-manager', 'brand-manager')),
  subject_id uuid not null,
  subject_type text not null check (subject_type in ('brand', 'team')),
  response text not null check (response in ('committed', 'exploring', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_interests_viewer_subject unique (viewer_id, subject_id)
);

create index if not exists discovery_interests_subject_idx on public.discovery_interests (subject_type, subject_id);
create index if not exists discovery_interests_viewer_idx on public.discovery_interests (viewer_id);

drop trigger if exists discovery_interests_updated_at on public.discovery_interests;
create trigger discovery_interests_updated_at
  before update on public.discovery_interests
  for each row execute procedure public.handle_updated_at();

alter table public.discovery_interests enable row level security;

drop policy if exists "Viewers manage own discovery interests" on public.discovery_interests;
create policy "Viewers manage own discovery interests"
  on public.discovery_interests for all
  using (viewer_id = auth.uid())
  with check (viewer_id = auth.uid());

-- ─── Partnerships ────────────────────────────────────────────────────────────
drop table if exists public.deliverables cascade;
drop table if exists public.partnerships cascade;

create table public.partnerships (
  id            uuid primary key default uuid_generate_v4(),
  brand_id      uuid not null references public.profiles (id) on delete cascade,
  athlete_id    uuid references public.profiles (id) on delete set null,
  team_id       uuid references public.profiles (id) on delete set null,
  title         text not null,
  deal_type     text not null,
  status        text not null default 'pending',
  value         numeric(12, 2),
  currency      text not null default 'USD',
  start_date    date,
  end_date      date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint partnerships_target_check check (athlete_id is not null or team_id is not null)
);

create trigger partnerships_updated_at
  before update on public.partnerships
  for each row execute procedure public.handle_updated_at();

create index partnerships_brand_id_idx   on public.partnerships (brand_id);
create index partnerships_athlete_id_idx on public.partnerships (athlete_id);
create index partnerships_team_id_idx    on public.partnerships (team_id);

create table public.deliverables (
  id              uuid primary key default uuid_generate_v4(),
  partnership_id  uuid not null references public.partnerships (id) on delete cascade,
  title           text not null,
  description     text,
  due_date        date,
  frequency       text not null default 'one_time'
                  check (frequency in ('one_time','daily','weekly','monthly','season')),
  status          text not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger deliverables_updated_at
  before update on public.deliverables
  for each row execute procedure public.handle_updated_at();

create index deliverables_partnership_id_idx on public.deliverables (partnership_id);

alter table public.partnerships enable row level security;
alter table public.deliverables  enable row level security;

create policy "Brands can view own partnerships"   on public.partnerships for select  using (auth.uid()=brand_id);
create policy "Brands can insert own partnerships" on public.partnerships for insert  with check (auth.uid()=brand_id);
create policy "Brands can update own partnerships" on public.partnerships for update  using (auth.uid()=brand_id);
create policy "Athletes can view own partnerships" on public.partnerships for select  using (auth.uid()=athlete_id);
create policy "Teams can view own partnerships"    on public.partnerships for select  using (auth.uid()=team_id);

create policy "Partnership participants can view deliverables" on public.deliverables for select
  using (exists (select 1 from public.partnerships p where p.id=deliverables.partnership_id and (p.brand_id=auth.uid() or p.athlete_id=auth.uid() or p.team_id=auth.uid())));

create policy "Brands can manage deliverables" on public.deliverables for all
  using (exists (select 1 from public.partnerships p where p.id=deliverables.partnership_id and p.brand_id=auth.uid()));

-- ─── Contact Messages ────────────────────────────────────────────────────────
drop table if exists public.contact_messages cascade;
create table public.contact_messages (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  email       text not null,
  subject     text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

alter table public.contact_messages enable row level security;
create policy "Anyone can submit a contact message" on public.contact_messages for insert with check (true);
create policy "Service role can read messages"      on public.contact_messages for select using (false);

-- ─── Storage bucket: Deliverable proof images ────────────────────────────────
-- This is required by `app/api/deals/[id]/deliverables/[deliverableId]/submit`.
-- Uploads are performed with the Supabase service role; the bucket must exist.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deliverable-proofs',
  'deliverable-proofs',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read proof images (URLs are unguessable paths)
drop policy if exists "Public read deliverable proofs" on storage.objects;
create policy "Public read deliverable proofs"
  on storage.objects for select
  using (bucket_id = 'deliverable-proofs');

-- ─── Reload schema cache ────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
