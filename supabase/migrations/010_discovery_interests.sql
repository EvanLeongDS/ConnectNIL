-- Team managers / brand managers record interest from Discover

create table public.discovery_interests (
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

create index discovery_interests_subject_idx on public.discovery_interests (subject_type, subject_id);
create index discovery_interests_viewer_idx on public.discovery_interests (viewer_id);

create trigger discovery_interests_updated_at
  before update on public.discovery_interests
  for each row execute procedure public.handle_updated_at();

alter table public.discovery_interests enable row level security;

create policy "Viewers manage own discovery interests"
  on public.discovery_interests for all
  using (viewer_id = auth.uid())
  with check (viewer_id = auth.uid());
