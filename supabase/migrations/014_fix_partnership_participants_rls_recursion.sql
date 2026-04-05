-- Fix: infinite recursion detected in policy for relation "partnerships"
-- Cause: policies on partnership_participants subquery partnerships; partnerships policies
--        subquery partnership_participants → cycle.
-- Fix: SECURITY DEFINER helpers read partnerships without re-applying RLS.

create or replace function public.user_is_team_on_partnership(p_partnership_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.partnerships p
    where p.id = p_partnership_id and p.team_id = (select auth.uid())
  );
$$;

create or replace function public.user_is_brand_on_partnership(p_partnership_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.partnerships p
    where p.id = p_partnership_id and p.brand_id = (select auth.uid())
  );
$$;

grant execute on function public.user_is_team_on_partnership(uuid) to authenticated;
grant execute on function public.user_is_brand_on_partnership(uuid) to authenticated;

drop policy if exists "Teams can view participation" on public.partnership_participants;
create policy "Teams can view participation"
  on public.partnership_participants for select
  using (user_is_team_on_partnership(partnership_id));

drop policy if exists "Brands can manage participation" on public.partnership_participants;
create policy "Brands can manage participation"
  on public.partnership_participants for all
  using (user_is_brand_on_partnership(partnership_id))
  with check (user_is_brand_on_partnership(partnership_id));

notify pgrst, 'reload schema';
