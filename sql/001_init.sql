create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'collaborator', 'viewer')),
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('admin', 'collaborator', 'viewer')),
  invited_by uuid not null references public.users (id) on delete cascade,
  accepted_by uuid references public.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_invitations_email_lowercase check (email = lower(email))
);

create unique index if not exists user_invitations_pending_email_idx
on public.user_invitations (email)
where accepted_at is null;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  gold_credit_days integer not null default 0 check (gold_credit_days >= 0),
  diamond_credit_days integer not null default 0 check (diamond_credit_days >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.users (id) on delete set null
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  customer_id uuid not null references public.customers (id),
  bill_date date not null,
  gold_amount numeric(12, 2) not null default 0 check (gold_amount >= 0),
  diamond_amount numeric(12, 2) not null default 0 check (diamond_amount >= 0),
  gold_due_date date,
  diamond_due_date date,
  due_date date not null,
  amount_paid_gold numeric(12, 2) not null default 0 check (amount_paid_gold >= 0),
  amount_paid_diamond numeric(12, 2) not null default 0 check (amount_paid_diamond >= 0),
  status text not null default 'open' check (status in ('open', 'partial', 'closed')),
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.users (id) on delete set null,
  check ((gold_amount + diamond_amount) > 0)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),
  payment_date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.users (id) on delete set null
);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  bill_id uuid not null references public.bills (id) on delete cascade,
  allocated_to text not null check (allocated_to in ('gold', 'diamond')),
  amount_allocated numeric(12, 2) not null check (amount_allocated >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_bills_customer_id on public.bills (customer_id);
create index if not exists idx_bills_due_date on public.bills (due_date);
create index if not exists idx_bills_gold_due_date on public.bills (gold_due_date);
create index if not exists idx_bills_diamond_due_date on public.bills (diamond_due_date);
create index if not exists idx_bills_status on public.bills (status);
create index if not exists idx_payments_customer_id on public.payments (customer_id);
create index if not exists idx_payment_allocations_payment_id on public.payment_allocations (payment_id);
create index if not exists idx_payment_allocations_bill_id on public.payment_allocations (bill_id);

create or replace function public.set_bill_due_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  diamond_credit_days integer;
  gold_credit_days integer;
begin
  if coalesce(new.gold_amount, 0) <= 0 and coalesce(new.diamond_amount, 0) <= 0 then
    raise exception 'Bill must include a gold amount, diamond amount, or both.';
  end if;

  select c.gold_credit_days, c.diamond_credit_days
  into gold_credit_days, diamond_credit_days
  from public.customers as c
  where c.id = new.customer_id;

  if gold_credit_days is null or diamond_credit_days is null then
    raise exception 'Unable to compute due date for customer %', new.customer_id;
  end if;

  new.gold_due_date := case
    when coalesce(new.gold_amount, 0) > 0 then new.bill_date + gold_credit_days
    else null
  end;

  new.diamond_due_date := case
    when coalesce(new.diamond_amount, 0) > 0 then new.bill_date + diamond_credit_days
    else null
  end;

  new.due_date := case
    when new.gold_due_date is not null and new.diamond_due_date is not null then greatest(new.gold_due_date, new.diamond_due_date)
    else coalesce(new.gold_due_date, new.diamond_due_date)
  end;

  if new.due_date is null then
    raise exception 'Unable to compute due date for customer %', new.customer_id;
  end if;

  return new;
end;
$$;

drop trigger if exists bills_set_due_date on public.bills;

create trigger bills_set_due_date
before insert or update of bill_date, customer_id, gold_amount, diamond_amount on public.bills
for each row
execute function public.set_bill_due_date();

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role
  from public.users as u
  where u.id = auth.uid()
    and u.is_active is true;
$$;

grant execute on function public.current_app_role() to authenticated;

alter table public.users enable row level security;
alter table public.user_invitations enable row level security;
alter table public.customers enable row level security;
alter table public.bills enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;

drop policy if exists users_select_authenticated on public.users;
create policy users_select_authenticated
on public.users
for select
to authenticated
using (auth.uid() = id or public.current_app_role() is not null);

drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin
on public.users
for insert
to authenticated
with check (public.current_app_role() = 'admin');

drop policy if exists users_update_admin on public.users;
create policy users_update_admin
on public.users
for update
to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin
on public.users
for delete
to authenticated
using (public.current_app_role() = 'admin');

drop policy if exists user_invitations_select_admin on public.user_invitations;
create policy user_invitations_select_admin
on public.user_invitations
for select
to authenticated
using (public.current_app_role() = 'admin');

drop policy if exists user_invitations_insert_admin on public.user_invitations;
create policy user_invitations_insert_admin
on public.user_invitations
for insert
to authenticated
with check (public.current_app_role() = 'admin');

drop policy if exists user_invitations_update_admin on public.user_invitations;
create policy user_invitations_update_admin
on public.user_invitations
for update
to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists user_invitations_delete_admin on public.user_invitations;
create policy user_invitations_delete_admin
on public.user_invitations
for delete
to authenticated
using (public.current_app_role() = 'admin');

drop policy if exists customers_select_authenticated on public.customers;
create policy customers_select_authenticated
on public.customers
for select
to authenticated
using (public.current_app_role() is not null);

drop policy if exists customers_insert_team on public.customers;
create policy customers_insert_team
on public.customers
for insert
to authenticated
with check (public.current_app_role() in ('admin', 'collaborator'));

drop policy if exists customers_update_team on public.customers;
create policy customers_update_team
on public.customers
for update
to authenticated
using (public.current_app_role() in ('admin', 'collaborator'))
with check (public.current_app_role() in ('admin', 'collaborator'));

drop policy if exists customers_delete_team on public.customers;
create policy customers_delete_team
on public.customers
for delete
to authenticated
using (public.current_app_role() in ('admin', 'collaborator'));

drop policy if exists bills_select_authenticated on public.bills;
create policy bills_select_authenticated
on public.bills
for select
to authenticated
using (public.current_app_role() is not null);

drop policy if exists bills_insert_team on public.bills;
create policy bills_insert_team
on public.bills
for insert
to authenticated
with check (public.current_app_role() in ('admin', 'collaborator'));

drop policy if exists bills_update_team on public.bills;
create policy bills_update_team
on public.bills
for update
to authenticated
using (public.current_app_role() in ('admin', 'collaborator'))
with check (public.current_app_role() in ('admin', 'collaborator'));

drop policy if exists bills_delete_team on public.bills;
create policy bills_delete_team
on public.bills
for delete
to authenticated
using (public.current_app_role() in ('admin', 'collaborator'));

drop policy if exists payments_select_authenticated on public.payments;
create policy payments_select_authenticated
on public.payments
for select
to authenticated
using (public.current_app_role() is not null);

drop policy if exists payments_insert_team on public.payments;
create policy payments_insert_team
on public.payments
for insert
to authenticated
with check (public.current_app_role() in ('admin', 'collaborator'));

drop policy if exists payments_update_team on public.payments;
create policy payments_update_team
on public.payments
for update
to authenticated
using (public.current_app_role() in ('admin', 'collaborator'))
with check (public.current_app_role() in ('admin', 'collaborator'));

drop policy if exists payments_delete_team on public.payments;
create policy payments_delete_team
on public.payments
for delete
to authenticated
using (public.current_app_role() in ('admin', 'collaborator'));

drop policy if exists payment_allocations_select_authenticated on public.payment_allocations;
create policy payment_allocations_select_authenticated
on public.payment_allocations
for select
to authenticated
using (public.current_app_role() is not null);

drop policy if exists payment_allocations_insert_team on public.payment_allocations;
create policy payment_allocations_insert_team
on public.payment_allocations
for insert
to authenticated
with check (public.current_app_role() in ('admin', 'collaborator'));

drop policy if exists payment_allocations_update_team on public.payment_allocations;
create policy payment_allocations_update_team
on public.payment_allocations
for update
to authenticated
using (public.current_app_role() in ('admin', 'collaborator'))
with check (public.current_app_role() in ('admin', 'collaborator'));

drop policy if exists payment_allocations_delete_team on public.payment_allocations;
create policy payment_allocations_delete_team
on public.payment_allocations
for delete
to authenticated
using (public.current_app_role() in ('admin', 'collaborator'));