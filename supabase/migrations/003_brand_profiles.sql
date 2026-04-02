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

create policy "Brands can view own profile"
  on public.brand_profiles for select
  using (auth.uid() = id);

create policy "Brands can insert own profile"
  on public.brand_profiles for insert
  with check (auth.uid() = id);

create policy "Brands can update own profile"
  on public.brand_profiles for update
  using (auth.uid() = id);
