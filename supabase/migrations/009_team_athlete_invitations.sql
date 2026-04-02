-- Team manager → athlete email invites with acceptance tracking

create table public.team_athlete_invitations (
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

create index team_athlete_invitations_team_id_idx on public.team_athlete_invitations (team_id);

create trigger team_athlete_invitations_updated_at
  before update on public.team_athlete_invitations
  for each row execute procedure public.handle_updated_at();

alter table public.team_athlete_invitations enable row level security;

create policy "Team managers read own athlete invitations"
  on public.team_athlete_invitations for select
  using (team_id = auth.uid());

create policy "Team managers insert own athlete invitations"
  on public.team_athlete_invitations for insert
  with check (team_id = auth.uid());

create policy "Team managers update own athlete invitations"
  on public.team_athlete_invitations for update
  using (team_id = auth.uid())
  with check (team_id = auth.uid());

create policy "Team managers delete own athlete invitations"
  on public.team_athlete_invitations for delete
  using (team_id = auth.uid());
