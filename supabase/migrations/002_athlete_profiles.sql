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

create policy "Athletes can view own profile"
  on public.athlete_profiles for select
  using (auth.uid() = id);

create policy "Athletes can insert own profile"
  on public.athlete_profiles for insert
  with check (auth.uid() = id);

create policy "Athletes can update own profile"
  on public.athlete_profiles for update
  using (auth.uid() = id);
