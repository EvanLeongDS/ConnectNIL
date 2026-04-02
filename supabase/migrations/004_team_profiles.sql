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

create policy "Team managers can view own profile"
  on public.team_profiles for select using (auth.uid() = id);

create policy "Team managers can insert own profile"
  on public.team_profiles for insert with check (auth.uid() = id);

create policy "Team managers can update own profile"
  on public.team_profiles for update using (auth.uid() = id);
