-- 015 Deal Payments
-- Tracks individual Stripe payment transactions for NIL partnerships.
-- ConnectNIL charges the brand and takes a 5% platform commission.

-- 1. Add payment tracking columns to partnerships
alter table public.partnerships
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid')),
  add column if not exists paid_cents integer not null default 0;

-- 2. deal_payments — one row per Stripe Checkout Session (one payment event)
create table if not exists public.deal_payments (
  id                          uuid        primary key default uuid_generate_v4(),
  partnership_id              uuid        not null references public.partnerships (id) on delete cascade,
  deliverable_id              uuid        references public.deliverables (id) on delete set null,
  stripe_checkout_session_id  text,
  stripe_payment_intent_id    text,
  amount_cents                integer     not null,       -- what the brand is charged
  commission_cents            integer     not null,       -- ConnectNIL 5% platform fee
  net_cents                   integer     not null,       -- 95% owed to team/athletes
  status                      text        not null default 'pending'
                              check (status in ('pending', 'processing', 'paid', 'failed')),
  payment_type                text        not null,       -- mirrors partnerships.payment_type
  installment_number          integer,                    -- for monthly: 1, 2, 3 …
  created_at                  timestamptz not null default now(),
  paid_at                     timestamptz
);

create index if not exists deal_payments_partnership_id_idx
  on public.deal_payments (partnership_id);

create index if not exists deal_payments_session_idx
  on public.deal_payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- 3. Row Level Security
alter table public.deal_payments enable row level security;

-- Brands can do everything on payments for their own deals
drop policy if exists "Brands can manage deal payments" on public.deal_payments;
create policy "Brands can manage deal payments"
  on public.deal_payments for all
  using (
    exists (
      select 1 from public.partnerships p
      where p.id = deal_payments.partnership_id
        and p.brand_id = auth.uid()
    )
  );

-- Teams can read payments on deals they are party to
drop policy if exists "Teams can view deal payments" on public.deal_payments;
create policy "Teams can view deal payments"
  on public.deal_payments for select
  using (
    exists (
      select 1 from public.partnerships p
      where p.id = deal_payments.partnership_id
        and p.team_id = auth.uid()
    )
  );

-- Athletes can read payments on deals they are directly on or on a team roster for
drop policy if exists "Athletes can view deal payments" on public.deal_payments;
create policy "Athletes can view deal payments"
  on public.deal_payments for select
  using (
    exists (
      select 1 from public.partnerships p
      where p.id = deal_payments.partnership_id
        and (
          p.athlete_id = auth.uid()
          or exists (
            select 1 from public.partnership_participants pp
            where pp.partnership_id = p.id
              and pp.athlete_id = auth.uid()
          )
        )
    )
  );

notify pgrst, 'reload schema';
