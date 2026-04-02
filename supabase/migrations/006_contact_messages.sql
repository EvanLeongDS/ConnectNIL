create table public.contact_messages (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  email       text not null,
  subject     text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- Anyone can insert (public contact form)
alter table public.contact_messages enable row level security;

create policy "Anyone can submit a contact message"
  on public.contact_messages for insert
  with check (true);

-- Only service role (admin) can read messages
create policy "Service role can read messages"
  on public.contact_messages for select
  using (false);
