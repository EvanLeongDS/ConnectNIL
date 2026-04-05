-- Typed signatures on deals + athletes can read team deals they are invited to via roster.

alter table public.partnerships
  add column if not exists brand_signer_name text,
  add column if not exists team_signer_name text;

-- Athletes invited on a team deal can read the partnership row.
drop policy if exists "Athletes can view partnerships via roster participation" on public.partnerships;
create policy "Athletes can view partnerships via roster participation"
  on public.partnerships for select
  using (
    exists (
      select 1 from public.partnership_participants pp
      where pp.partnership_id = partnerships.id
        and pp.athlete_id = auth.uid()
    )
  );

-- Deliverables: roster athletes (partnership_participants) can read line items for their deal.
drop policy if exists "Partnership participants can view deliverables" on public.deliverables;
create policy "Partnership participants can view deliverables"
  on public.deliverables for select
  using (
    exists (
      select 1 from public.partnerships p
      where p.id = deliverables.partnership_id
        and (
          p.brand_id = auth.uid()
          or p.athlete_id = auth.uid()
          or p.team_id = auth.uid()
          or exists (
            select 1 from public.partnership_participants pp
            where pp.partnership_id = p.id
              and pp.athlete_id = auth.uid()
          )
        )
    )
  );

notify pgrst, 'reload schema';
