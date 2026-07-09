-- Consolidated DB setup script
-- Generated from sql/001..010 migrations in lexical order

-- ==========================================
-- BEGIN: sql/001_init.sql
-- ==========================================
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
-- END: sql/001_init.sql

-- ==========================================
-- BEGIN: sql/002_auth_setup.sql
-- ==========================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, email, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), new.email),
    new.email,
    coalesce(
      (
        select invitation.role
        from public.user_invitations as invitation
        where invitation.email = lower(new.email)
          and invitation.accepted_at is null
        order by invitation.created_at desc
        limit 1
      ),
      'viewer'
    ),
    exists (
      select 1
      from public.user_invitations as invitation
      where invitation.email = lower(new.email)
        and invitation.accepted_at is null
    )
  )
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email;

  update public.user_invitations
  set accepted_at = timezone('utc', now()),
      accepted_by = new.id
  where email = lower(new.email)
    and accepted_at is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

insert into public.users (id, name, email, role, is_active)
select
  auth_user.id,
  coalesce(auth_user.raw_user_meta_data ->> 'name', split_part(auth_user.email, '@', 1), auth_user.email),
  auth_user.email,
  'viewer',
  true
from auth.users as auth_user
left join public.users as public_user on public_user.id = auth_user.id
where public_user.id is null;
-- END: sql/002_auth_setup.sql

-- ==========================================
-- BEGIN: sql/003_payment_allocation_engine.sql
-- ==========================================
create or replace function public.create_payment_with_allocations(
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_created_by uuid;
  v_role text;
  v_remaining_amount numeric(12, 2);
  v_allocation_amount numeric(12, 2);
  v_gold_outstanding numeric(12, 2);
  v_diamond_outstanding numeric(12, 2);
  v_first_allocated_to text;
  v_second_allocated_to text;
  v_bill record;
begin
  v_created_by := auth.uid();
  v_role := public.current_app_role();

  if v_created_by is null then
    raise exception 'Unauthorized';
  end if;

  if v_role not in ('admin', 'collaborator') then
    raise exception 'Unauthorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required.';
  end if;

  if not exists (
    select 1
    from public.customers
    where id = p_customer_id
  ) then
    raise exception 'Selected customer was not found.';
  end if;

  insert into public.payments (
    customer_id,
    payment_date,
    amount,
    notes,
    created_by
  )
  values (
    p_customer_id,
    p_payment_date,
    round(p_amount::numeric, 2),
    nullif(trim(p_notes), ''),
    v_created_by
  )
  returning id into v_payment_id;

  v_remaining_amount := round(p_amount::numeric, 2);

  for v_bill in
    select
      b.id,
      b.bill_date,
      b.created_at,
      b.gold_amount,
      b.diamond_amount,
      b.amount_paid_gold,
      b.amount_paid_diamond,
      b.gold_due_date,
      b.diamond_due_date,
      case
        when b.gold_due_date is not null and b.diamond_due_date is not null then least(b.gold_due_date, b.diamond_due_date)
        else coalesce(b.gold_due_date, b.diamond_due_date, b.due_date)
      end as bill_due_date
    from public.bills as b
    where b.customer_id = p_customer_id
      and b.status in ('open', 'partial')
      and (
        b.amount_paid_gold < b.gold_amount
        or b.amount_paid_diamond < b.diamond_amount
      )
    order by
      case
        when
          case
            when b.gold_due_date is not null and b.diamond_due_date is not null then least(b.gold_due_date, b.diamond_due_date)
            else coalesce(b.gold_due_date, b.diamond_due_date, b.due_date)
          end is null then 1
        else 0
      end asc,
      (
        current_date -
        case
          when b.gold_due_date is not null and b.diamond_due_date is not null then least(b.gold_due_date, b.diamond_due_date)
          else coalesce(b.gold_due_date, b.diamond_due_date, b.due_date)
        end
      ) desc nulls last,
      case
        when b.gold_due_date is not null and b.diamond_due_date is not null then least(b.gold_due_date, b.diamond_due_date)
        else coalesce(b.gold_due_date, b.diamond_due_date, b.due_date)
      end asc nulls last,
      b.bill_date asc,
      b.created_at asc,
      b.id asc
  loop
    exit when v_remaining_amount <= 0;

    v_gold_outstanding := round(greatest(v_bill.gold_amount - v_bill.amount_paid_gold, 0)::numeric, 2);
    v_diamond_outstanding := round(
      greatest(v_bill.diamond_amount - v_bill.amount_paid_diamond, 0)::numeric,
      2
    );

    if v_gold_outstanding <= 0 and v_diamond_outstanding <= 0 then
      continue;
    end if;

    if v_gold_outstanding <= 0 then
      v_first_allocated_to := 'diamond';
      v_second_allocated_to := 'gold';
    elsif v_diamond_outstanding <= 0 then
      v_first_allocated_to := 'gold';
      v_second_allocated_to := 'diamond';
    elsif v_bill.gold_due_date is null and v_bill.diamond_due_date is not null then
      v_first_allocated_to := 'diamond';
      v_second_allocated_to := 'gold';
    elsif v_bill.diamond_due_date is null and v_bill.gold_due_date is not null then
      v_first_allocated_to := 'gold';
      v_second_allocated_to := 'diamond';
    elsif v_bill.gold_due_date <= v_bill.diamond_due_date then
      v_first_allocated_to := 'gold';
      v_second_allocated_to := 'diamond';
    else
      v_first_allocated_to := 'diamond';
      v_second_allocated_to := 'gold';
    end if;

    if v_first_allocated_to = 'gold' and v_gold_outstanding > 0 and v_remaining_amount > 0 then
      v_allocation_amount := least(v_remaining_amount, v_gold_outstanding);

      if v_allocation_amount > 0 then
        insert into public.payment_allocations (
          payment_id,
          bill_id,
          allocated_to,
          amount_allocated
        )
        values (
          v_payment_id,
          v_bill.id,
          'gold',
          round(v_allocation_amount::numeric, 2)
        );

        update public.bills
        set
          amount_paid_gold = round((amount_paid_gold + v_allocation_amount)::numeric, 2),
          status = case
            when greatest(gold_amount - round((amount_paid_gold + v_allocation_amount)::numeric, 2), 0) = 0
              and greatest(diamond_amount - amount_paid_diamond, 0) = 0 then 'closed'
            when round((amount_paid_gold + v_allocation_amount)::numeric, 2) > 0 or amount_paid_diamond > 0 then 'partial'
            else 'open'
          end
        where id = v_bill.id;

        v_remaining_amount := round((v_remaining_amount - v_allocation_amount)::numeric, 2);
        v_gold_outstanding := round((v_gold_outstanding - v_allocation_amount)::numeric, 2);
      end if;
    elsif v_first_allocated_to = 'diamond' and v_diamond_outstanding > 0 and v_remaining_amount > 0 then
      v_allocation_amount := least(v_remaining_amount, v_diamond_outstanding);

      if v_allocation_amount > 0 then
        insert into public.payment_allocations (
          payment_id,
          bill_id,
          allocated_to,
          amount_allocated
        )
        values (
          v_payment_id,
          v_bill.id,
          'diamond',
          round(v_allocation_amount::numeric, 2)
        );

        update public.bills
        set
          amount_paid_diamond = round((amount_paid_diamond + v_allocation_amount)::numeric, 2),
          status = case
            when greatest(gold_amount - amount_paid_gold, 0) = 0
              and greatest(diamond_amount - round((amount_paid_diamond + v_allocation_amount)::numeric, 2), 0) = 0 then 'closed'
            when amount_paid_gold > 0 or round((amount_paid_diamond + v_allocation_amount)::numeric, 2) > 0 then 'partial'
            else 'open'
          end
        where id = v_bill.id;

        v_remaining_amount := round((v_remaining_amount - v_allocation_amount)::numeric, 2);
        v_diamond_outstanding := round((v_diamond_outstanding - v_allocation_amount)::numeric, 2);
      end if;
    end if;

    if v_second_allocated_to = 'gold' and v_gold_outstanding > 0 and v_remaining_amount > 0 then
      v_allocation_amount := least(v_remaining_amount, v_gold_outstanding);

      if v_allocation_amount > 0 then
        insert into public.payment_allocations (
          payment_id,
          bill_id,
          allocated_to,
          amount_allocated
        )
        values (
          v_payment_id,
          v_bill.id,
          'gold',
          round(v_allocation_amount::numeric, 2)
        );

        update public.bills
        set
          amount_paid_gold = round((amount_paid_gold + v_allocation_amount)::numeric, 2),
          status = case
            when greatest(gold_amount - round((amount_paid_gold + v_allocation_amount)::numeric, 2), 0) = 0
              and greatest(diamond_amount - amount_paid_diamond, 0) = 0 then 'closed'
            when round((amount_paid_gold + v_allocation_amount)::numeric, 2) > 0 or amount_paid_diamond > 0 then 'partial'
            else 'open'
          end
        where id = v_bill.id;

        v_remaining_amount := round((v_remaining_amount - v_allocation_amount)::numeric, 2);
      end if;
    elsif v_second_allocated_to = 'diamond' and v_diamond_outstanding > 0 and v_remaining_amount > 0 then
      v_allocation_amount := least(v_remaining_amount, v_diamond_outstanding);

      if v_allocation_amount > 0 then
        insert into public.payment_allocations (
          payment_id,
          bill_id,
          allocated_to,
          amount_allocated
        )
        values (
          v_payment_id,
          v_bill.id,
          'diamond',
          round(v_allocation_amount::numeric, 2)
        );

        update public.bills
        set
          amount_paid_diamond = round((amount_paid_diamond + v_allocation_amount)::numeric, 2),
          status = case
            when greatest(gold_amount - amount_paid_gold, 0) = 0
              and greatest(diamond_amount - round((amount_paid_diamond + v_allocation_amount)::numeric, 2), 0) = 0 then 'closed'
            when amount_paid_gold > 0 or round((amount_paid_diamond + v_allocation_amount)::numeric, 2) > 0 then 'partial'
            else 'open'
          end
        where id = v_bill.id;

        v_remaining_amount := round((v_remaining_amount - v_allocation_amount)::numeric, 2);
      end if;
    end if;
  end loop;

  return v_payment_id;
end;
$$;

grant execute on function public.create_payment_with_allocations(uuid, date, numeric, text) to authenticated;
-- END: sql/003_payment_allocation_engine.sql

-- ==========================================
-- BEGIN: sql/004_bill_dual_amounts.sql
-- ==========================================
alter table public.bills
  add column if not exists gold_amount numeric(12, 2) not null default 0,
  add column if not exists diamond_amount numeric(12, 2) not null default 0,
  add column if not exists gold_due_date date,
  add column if not exists diamond_due_date date,
  add column if not exists amount_paid_gold numeric(12, 2) not null default 0,
  add column if not exists amount_paid_diamond numeric(12, 2) not null default 0;

alter table public.payment_allocations
  add column if not exists allocated_to text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bills'
      and column_name = 'item_type'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bills'
      and column_name = 'amount'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bills'
      and column_name = 'amount_paid'
  ) then
    execute $sql$
      update public.bills
      set
        gold_amount = case
          when coalesce(gold_amount, 0) = 0 and coalesce(item_type, '') = 'gold' then coalesce(amount, 0)
          else gold_amount
        end,
        diamond_amount = case
          when coalesce(diamond_amount, 0) = 0 and coalesce(item_type, '') = 'diamond' then coalesce(amount, 0)
          else diamond_amount
        end,
        amount_paid_gold = case
          when coalesce(amount_paid_gold, 0) = 0 and coalesce(item_type, '') = 'gold' then coalesce(amount_paid, 0)
          else amount_paid_gold
        end,
        amount_paid_diamond = case
          when coalesce(amount_paid_diamond, 0) = 0 and coalesce(item_type, '') = 'diamond' then coalesce(amount_paid, 0)
          else amount_paid_diamond
        end
    $sql$;

    execute $sql$
      update public.payment_allocations as pa
      set allocated_to = b.item_type
      from public.bills as b
      where pa.bill_id = b.id
        and pa.allocated_to is null
    $sql$;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_allocations_allocated_to_check'
      and conrelid = 'public.payment_allocations'::regclass
  ) then
    alter table public.payment_allocations
      add constraint payment_allocations_allocated_to_check
      check (allocated_to in ('gold', 'diamond'));
  end if;
end;
$$;

alter table public.payment_allocations
  alter column allocated_to set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bills_positive_amounts_check'
      and conrelid = 'public.bills'::regclass
  ) then
    alter table public.bills
      add constraint bills_positive_amounts_check
      check ((gold_amount + diamond_amount) > 0);
  end if;
end;
$$;

drop trigger if exists bills_set_due_date on public.bills;

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

create trigger bills_set_due_date
before insert or update of bill_date, customer_id, gold_amount, diamond_amount on public.bills
for each row
execute function public.set_bill_due_date();

alter table public.bills
  drop column if exists item_type,
  drop column if exists amount,
  drop column if exists amount_paid;
-- END: sql/004_bill_dual_amounts.sql

-- ==========================================
-- BEGIN: sql/005_bill_separate_due_dates.sql
-- ==========================================
alter table public.bills
  add column if not exists gold_due_date date,
  add column if not exists diamond_due_date date;

create index if not exists idx_bills_gold_due_date on public.bills (gold_due_date);
create index if not exists idx_bills_diamond_due_date on public.bills (diamond_due_date);

update public.bills as b
set
  gold_due_date = case
    when coalesce(b.gold_amount, 0) > 0 then b.bill_date + c.gold_credit_days
    else null
  end,
  diamond_due_date = case
    when coalesce(b.diamond_amount, 0) > 0 then b.bill_date + c.diamond_credit_days
    else null
  end,
  due_date = case
    when coalesce(b.gold_amount, 0) > 0 and coalesce(b.diamond_amount, 0) > 0 then greatest(b.bill_date + c.gold_credit_days, b.bill_date + c.diamond_credit_days)
    when coalesce(b.gold_amount, 0) > 0 then b.bill_date + c.gold_credit_days
    when coalesce(b.diamond_amount, 0) > 0 then b.bill_date + c.diamond_credit_days
    else b.due_date
  end
from public.customers as c
where c.id = b.customer_id;

drop trigger if exists bills_set_due_date on public.bills;

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

create trigger bills_set_due_date
before insert or update of bill_date, customer_id, gold_amount, diamond_amount on public.bills
for each row
execute function public.set_bill_due_date();

create or replace function public.create_payment_with_allocations(
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_created_by uuid;
  v_role text;
  v_remaining_amount numeric(12, 2);
  v_allocation_amount numeric(12, 2);
  v_bill record;
begin
  v_created_by := auth.uid();
  v_role := public.current_app_role();

  if v_created_by is null then
    raise exception 'Unauthorized';
  end if;

  if v_role not in ('admin', 'collaborator') then
    raise exception 'Unauthorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required.';
  end if;

  if not exists (
    select 1
    from public.customers
    where id = p_customer_id
  ) then
    raise exception 'Selected customer was not found.';
  end if;

  insert into public.payments (
    customer_id,
    payment_date,
    amount,
    notes,
    created_by
  )
  values (
    p_customer_id,
    p_payment_date,
    round(p_amount::numeric, 2),
    nullif(trim(p_notes), ''),
    v_created_by
  )
  returning id into v_payment_id;

  v_remaining_amount := round(p_amount::numeric, 2);

  for v_bill in
    select candidate.*
    from (
      select
        b.id,
        'gold'::text as allocated_to,
        round((b.gold_amount - b.amount_paid_gold)::numeric, 2) as outstanding_amount,
        b.gold_due_date as item_due_date,
        b.bill_date,
        b.created_at
      from public.bills as b
      where b.customer_id = p_customer_id
        and b.status in ('open', 'partial')
        and b.amount_paid_gold < b.gold_amount

      union all

      select
        b.id,
        'diamond'::text as allocated_to,
        round((b.diamond_amount - b.amount_paid_diamond)::numeric, 2) as outstanding_amount,
        b.diamond_due_date as item_due_date,
        b.bill_date,
        b.created_at
      from public.bills as b
      where b.customer_id = p_customer_id
        and b.status in ('open', 'partial')
        and b.amount_paid_diamond < b.diamond_amount
    ) as candidate
    order by
      case when candidate.item_due_date is null then 1 else 0 end asc,
      (current_date - candidate.item_due_date) desc nulls last,
      candidate.item_due_date asc nulls last,
      case when candidate.allocated_to = 'gold' then 0 else 1 end asc,
      candidate.bill_date asc,
      candidate.created_at asc,
      candidate.id asc
  loop
    exit when v_remaining_amount <= 0;

    if v_bill.outstanding_amount <= 0 then
      continue;
    end if;

    v_allocation_amount := least(v_remaining_amount, v_bill.outstanding_amount);

    if v_allocation_amount <= 0 then
      continue;
    end if;

    insert into public.payment_allocations (
      payment_id,
      bill_id,
      allocated_to,
      amount_allocated
    )
    values (
      v_payment_id,
      v_bill.id,
      v_bill.allocated_to,
      round(v_allocation_amount::numeric, 2)
    );

    if v_bill.allocated_to = 'gold' then
      update public.bills
      set
        amount_paid_gold = round((amount_paid_gold + v_allocation_amount)::numeric, 2),
        status = case
          when greatest(gold_amount - round((amount_paid_gold + v_allocation_amount)::numeric, 2), 0) = 0
            and greatest(diamond_amount - amount_paid_diamond, 0) = 0 then 'closed'
          when round((amount_paid_gold + v_allocation_amount)::numeric, 2) > 0 or amount_paid_diamond > 0 then 'partial'
          else 'open'
        end
      where id = v_bill.id;
    else
      update public.bills
      set
        amount_paid_diamond = round((amount_paid_diamond + v_allocation_amount)::numeric, 2),
        status = case
          when greatest(gold_amount - amount_paid_gold, 0) = 0
            and greatest(diamond_amount - round((amount_paid_diamond + v_allocation_amount)::numeric, 2), 0) = 0 then 'closed'
          when amount_paid_gold > 0 or round((amount_paid_diamond + v_allocation_amount)::numeric, 2) > 0 then 'partial'
          else 'open'
        end
      where id = v_bill.id;
    end if;

    v_remaining_amount := round((v_remaining_amount - v_allocation_amount)::numeric, 2);
  end loop;

  return v_payment_id;
end;
$$;

grant execute on function public.create_payment_with_allocations(uuid, date, numeric, text) to authenticated;
-- END: sql/005_bill_separate_due_dates.sql

-- ==========================================
-- BEGIN: sql/006_performance_indexes.sql
-- ==========================================
-- Composite indexes for common filter + sort patterns in app queries.
create index if not exists idx_bills_status_created_at on public.bills (status, created_at desc);
create index if not exists idx_bills_customer_status_created_at on public.bills (customer_id, status, created_at desc);

create index if not exists idx_payments_customer_payment_date_created_at on public.payments (customer_id, payment_date desc, created_at desc);
create index if not exists idx_payments_payment_date_created_at on public.payments (payment_date desc, created_at desc);

create index if not exists idx_payment_allocations_payment_created_at on public.payment_allocations (payment_id, created_at desc);

-- END: sql/006_performance_indexes.sql

-- ==========================================
-- BEGIN: sql/007_customer_advance_balance.sql
-- ==========================================
alter table public.customers
  add column if not exists advance_amount numeric(12, 2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_advance_amount_non_negative'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_advance_amount_non_negative
      check (advance_amount >= 0);
  end if;
end;
$$;

create or replace function public.apply_customer_advance_to_open_bills(
  p_customer_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
  v_role text;
  v_bill record;
  v_payment record;
  v_payment_remaining_amount numeric(12, 2);
  v_allocation_amount numeric(12, 2);
  v_remaining_advance_amount numeric(12, 2);
begin
  v_created_by := auth.uid();
  v_role := public.current_app_role();

  if v_created_by is null then
    raise exception 'Unauthorized';
  end if;

  if v_role not in ('admin', 'collaborator') then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1
    from public.customers
    where id = p_customer_id
    for update
  ) then
    raise exception 'Selected customer was not found.';
  end if;

  for v_payment in
    select payment_rows.*
    from (
      select
        p.id,
        p.payment_date,
        p.created_at,
        round((p.amount - coalesce(sum(pa.amount_allocated), 0))::numeric, 2) as unallocated_amount
      from public.payments as p
      left join public.payment_allocations as pa
        on pa.payment_id = p.id
      where p.customer_id = p_customer_id
      group by p.id, p.amount, p.payment_date, p.created_at
    ) as payment_rows
    where payment_rows.unallocated_amount > 0
    order by payment_rows.payment_date asc, payment_rows.created_at asc, payment_rows.id asc
  loop
    v_payment_remaining_amount := round(v_payment.unallocated_amount::numeric, 2);

    for v_bill in
      select candidate.*
      from (
        select
          b.id,
          'gold'::text as allocated_to,
          round((b.gold_amount - b.amount_paid_gold)::numeric, 2) as outstanding_amount,
          b.gold_due_date as item_due_date,
          b.bill_date,
          b.created_at
        from public.bills as b
        where b.customer_id = p_customer_id
          and b.status in ('open', 'partial')
          and b.amount_paid_gold < b.gold_amount

        union all

        select
          b.id,
          'diamond'::text as allocated_to,
          round((b.diamond_amount - b.amount_paid_diamond)::numeric, 2) as outstanding_amount,
          b.diamond_due_date as item_due_date,
          b.bill_date,
          b.created_at
        from public.bills as b
        where b.customer_id = p_customer_id
          and b.status in ('open', 'partial')
          and b.amount_paid_diamond < b.diamond_amount
      ) as candidate
      order by
        case when candidate.item_due_date is null then 1 else 0 end asc,
        (current_date - candidate.item_due_date) desc nulls last,
        candidate.item_due_date asc nulls last,
        case when candidate.allocated_to = 'gold' then 0 else 1 end asc,
        candidate.bill_date asc,
        candidate.created_at asc,
        candidate.id asc
    loop
      exit when v_payment_remaining_amount <= 0;

      if v_bill.outstanding_amount <= 0 then
        continue;
      end if;

      v_allocation_amount := least(v_payment_remaining_amount, v_bill.outstanding_amount);

      if v_allocation_amount <= 0 then
        continue;
      end if;

      insert into public.payment_allocations (
        payment_id,
        bill_id,
        allocated_to,
        amount_allocated
      )
      values (
        v_payment.id,
        v_bill.id,
        v_bill.allocated_to,
        round(v_allocation_amount::numeric, 2)
      );

      if v_bill.allocated_to = 'gold' then
        update public.bills
        set
          amount_paid_gold = round((amount_paid_gold + v_allocation_amount)::numeric, 2),
          status = case
            when greatest(gold_amount - round((amount_paid_gold + v_allocation_amount)::numeric, 2), 0) = 0
              and greatest(diamond_amount - amount_paid_diamond, 0) = 0 then 'closed'
            when round((amount_paid_gold + v_allocation_amount)::numeric, 2) > 0 or amount_paid_diamond > 0 then 'partial'
            else 'open'
          end
        where id = v_bill.id;
      else
        update public.bills
        set
          amount_paid_diamond = round((amount_paid_diamond + v_allocation_amount)::numeric, 2),
          status = case
            when greatest(gold_amount - amount_paid_gold, 0) = 0
              and greatest(diamond_amount - round((amount_paid_diamond + v_allocation_amount)::numeric, 2), 0) = 0 then 'closed'
            when amount_paid_gold > 0 or round((amount_paid_diamond + v_allocation_amount)::numeric, 2) > 0 then 'partial'
            else 'open'
          end
        where id = v_bill.id;
      end if;

      v_payment_remaining_amount := round((v_payment_remaining_amount - v_allocation_amount)::numeric, 2);
    end loop;
  end loop;

  select
    coalesce(sum(payment_rows.unallocated_amount), 0)
  into v_remaining_advance_amount
  from (
    select
      round((p.amount - coalesce(sum(pa.amount_allocated), 0))::numeric, 2) as unallocated_amount
    from public.payments as p
    left join public.payment_allocations as pa
      on pa.payment_id = p.id
    where p.customer_id = p_customer_id
    group by p.id, p.amount
  ) as payment_rows
  where payment_rows.unallocated_amount > 0;

  update public.customers
  set advance_amount = round(coalesce(v_remaining_advance_amount, 0)::numeric, 2)
  where id = p_customer_id;

  return round(coalesce(v_remaining_advance_amount, 0)::numeric, 2);
end;
$$;

grant execute on function public.apply_customer_advance_to_open_bills(uuid) to authenticated;

create or replace function public.create_payment_with_allocations(
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_created_by uuid;
  v_role text;
  v_remaining_amount numeric(12, 2);
  v_allocation_amount numeric(12, 2);
  v_bill record;
begin
  v_created_by := auth.uid();
  v_role := public.current_app_role();

  if v_created_by is null then
    raise exception 'Unauthorized';
  end if;

  if v_role not in ('admin', 'collaborator') then
    raise exception 'Unauthorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required.';
  end if;

  if not exists (
    select 1
    from public.customers
    where id = p_customer_id
    for update
  ) then
    raise exception 'Selected customer was not found.';
  end if;

  insert into public.payments (
    customer_id,
    payment_date,
    amount,
    notes,
    created_by
  )
  values (
    p_customer_id,
    p_payment_date,
    round(p_amount::numeric, 2),
    nullif(trim(p_notes), ''),
    v_created_by
  )
  returning id into v_payment_id;

  v_remaining_amount := round(p_amount::numeric, 2);

  for v_bill in
    select candidate.*
    from (
      select
        b.id,
        'gold'::text as allocated_to,
        round((b.gold_amount - b.amount_paid_gold)::numeric, 2) as outstanding_amount,
        b.gold_due_date as item_due_date,
        b.bill_date,
        b.created_at
      from public.bills as b
      where b.customer_id = p_customer_id
        and b.status in ('open', 'partial')
        and b.amount_paid_gold < b.gold_amount

      union all

      select
        b.id,
        'diamond'::text as allocated_to,
        round((b.diamond_amount - b.amount_paid_diamond)::numeric, 2) as outstanding_amount,
        b.diamond_due_date as item_due_date,
        b.bill_date,
        b.created_at
      from public.bills as b
      where b.customer_id = p_customer_id
        and b.status in ('open', 'partial')
        and b.amount_paid_diamond < b.diamond_amount
    ) as candidate
    order by
      case when candidate.item_due_date is null then 1 else 0 end asc,
      (current_date - candidate.item_due_date) desc nulls last,
      candidate.item_due_date asc nulls last,
      case when candidate.allocated_to = 'gold' then 0 else 1 end asc,
      candidate.bill_date asc,
      candidate.created_at asc,
      candidate.id asc
  loop
    exit when v_remaining_amount <= 0;

    if v_bill.outstanding_amount <= 0 then
      continue;
    end if;

    v_allocation_amount := least(v_remaining_amount, v_bill.outstanding_amount);

    if v_allocation_amount <= 0 then
      continue;
    end if;

    insert into public.payment_allocations (
      payment_id,
      bill_id,
      allocated_to,
      amount_allocated
    )
    values (
      v_payment_id,
      v_bill.id,
      v_bill.allocated_to,
      round(v_allocation_amount::numeric, 2)
    );

    if v_bill.allocated_to = 'gold' then
      update public.bills
      set
        amount_paid_gold = round((amount_paid_gold + v_allocation_amount)::numeric, 2),
        status = case
          when greatest(gold_amount - round((amount_paid_gold + v_allocation_amount)::numeric, 2), 0) = 0
            and greatest(diamond_amount - amount_paid_diamond, 0) = 0 then 'closed'
          when round((amount_paid_gold + v_allocation_amount)::numeric, 2) > 0 or amount_paid_diamond > 0 then 'partial'
          else 'open'
        end
      where id = v_bill.id;
    else
      update public.bills
      set
        amount_paid_diamond = round((amount_paid_diamond + v_allocation_amount)::numeric, 2),
        status = case
          when greatest(gold_amount - amount_paid_gold, 0) = 0
            and greatest(diamond_amount - round((amount_paid_diamond + v_allocation_amount)::numeric, 2), 0) = 0 then 'closed'
          when amount_paid_gold > 0 or round((amount_paid_diamond + v_allocation_amount)::numeric, 2) > 0 then 'partial'
          else 'open'
        end
      where id = v_bill.id;
    end if;

    v_remaining_amount := round((v_remaining_amount - v_allocation_amount)::numeric, 2);
  end loop;

  update public.customers
  set advance_amount = round((coalesce(advance_amount, 0) + greatest(v_remaining_amount, 0))::numeric, 2)
  where id = p_customer_id;

  return v_payment_id;
end;
$$;

grant execute on function public.create_payment_with_allocations(uuid, date, numeric, text) to authenticated;
-- END: sql/007_customer_advance_balance.sql

-- ==========================================
-- BEGIN: sql/008_manual_payment_allocation.sql
-- ==========================================
create or replace function public.create_payment_with_manual_allocations(
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_notes text default null,
  p_allocations jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_created_by uuid;
  v_role text;
  v_remaining_amount numeric(12, 2);
  v_requested_amount numeric(12, 2);
  v_outstanding_amount numeric(12, 2);
  v_allocation record;
  v_bill record;
  v_allocated_to text;
begin
  v_created_by := auth.uid();
  v_role := public.current_app_role();

  if v_created_by is null then
    raise exception 'Unauthorized';
  end if;

  if v_role not in ('admin', 'collaborator') then
    raise exception 'Unauthorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required.';
  end if;

  if p_allocations is null then
    p_allocations := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Manual allocations payload must be an array.';
  end if;

  if not exists (
    select 1
    from public.customers
    where id = p_customer_id
    for update
  ) then
    raise exception 'Selected customer was not found.';
  end if;

  insert into public.payments (
    customer_id,
    payment_date,
    amount,
    notes,
    created_by
  )
  values (
    p_customer_id,
    p_payment_date,
    round(p_amount::numeric, 2),
    nullif(trim(p_notes), ''),
    v_created_by
  )
  returning id into v_payment_id;

  v_remaining_amount := round(p_amount::numeric, 2);

  for v_allocation in
    select value as payload
    from jsonb_array_elements(p_allocations)
  loop
    if v_remaining_amount <= 0 then
      raise exception 'Manual allocation total exceeds payment amount.';
    end if;

    v_allocated_to := lower(coalesce(trim(v_allocation.payload ->> 'allocatedTo'), ''));
    v_requested_amount := round(coalesce((v_allocation.payload ->> 'amount')::numeric, 0)::numeric, 2);

    if v_allocated_to not in ('gold', 'diamond') then
      raise exception 'Manual allocation type is invalid.';
    end if;

    if v_requested_amount <= 0 then
      raise exception 'Manual allocation amount must be greater than zero.';
    end if;

    select
      b.id,
      b.gold_amount,
      b.diamond_amount,
      b.amount_paid_gold,
      b.amount_paid_diamond
    into v_bill
    from public.bills as b
    where b.id = (v_allocation.payload ->> 'billId')::uuid
      and b.customer_id = p_customer_id
    for update;

    if not found then
      raise exception 'Manual allocation bill was not found for the selected customer.';
    end if;

    if v_allocated_to = 'gold' then
      v_outstanding_amount := round(greatest(v_bill.gold_amount - v_bill.amount_paid_gold, 0)::numeric, 2);
    else
      v_outstanding_amount := round(
        greatest(v_bill.diamond_amount - v_bill.amount_paid_diamond, 0)::numeric,
        2
      );
    end if;

    if v_outstanding_amount <= 0 then
      raise exception 'Manual allocation exceeds outstanding amount for a bill portion.';
    end if;

    if v_requested_amount > v_outstanding_amount then
      raise exception 'Manual allocation exceeds outstanding amount for a bill portion.';
    end if;

    if v_requested_amount > v_remaining_amount then
      raise exception 'Manual allocation total exceeds payment amount.';
    end if;

    insert into public.payment_allocations (
      payment_id,
      bill_id,
      allocated_to,
      amount_allocated
    )
    values (
      v_payment_id,
      v_bill.id,
      v_allocated_to,
      v_requested_amount
    );

    if v_allocated_to = 'gold' then
      update public.bills
      set
        amount_paid_gold = round((amount_paid_gold + v_requested_amount)::numeric, 2),
        status = case
          when greatest(gold_amount - round((amount_paid_gold + v_requested_amount)::numeric, 2), 0) = 0
            and greatest(diamond_amount - amount_paid_diamond, 0) = 0 then 'closed'
          when round((amount_paid_gold + v_requested_amount)::numeric, 2) > 0 or amount_paid_diamond > 0 then 'partial'
          else 'open'
        end
      where id = v_bill.id;
    else
      update public.bills
      set
        amount_paid_diamond = round((amount_paid_diamond + v_requested_amount)::numeric, 2),
        status = case
          when greatest(gold_amount - amount_paid_gold, 0) = 0
            and greatest(diamond_amount - round((amount_paid_diamond + v_requested_amount)::numeric, 2), 0) = 0 then 'closed'
          when amount_paid_gold > 0 or round((amount_paid_diamond + v_requested_amount)::numeric, 2) > 0 then 'partial'
          else 'open'
        end
      where id = v_bill.id;
    end if;

    v_remaining_amount := round((v_remaining_amount - v_requested_amount)::numeric, 2);
  end loop;

  update public.customers
  set advance_amount = round((coalesce(advance_amount, 0) + greatest(v_remaining_amount, 0))::numeric, 2)
  where id = p_customer_id;

  return v_payment_id;
end;
$$;

grant execute on function public.create_payment_with_manual_allocations(uuid, date, numeric, text, jsonb) to authenticated;

-- END: sql/008_manual_payment_allocation.sql

-- ==========================================
-- BEGIN: sql/009_pending_user_activation.sql
-- ==========================================
alter table public.users
add column if not exists is_active boolean not null default true;

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

update public.users
set is_active = true
where is_active is null;

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

drop policy if exists users_select_authenticated on public.users;
create policy users_select_authenticated
on public.users
for select
to authenticated
using (auth.uid() = id or public.current_app_role() is not null);

alter table public.user_invitations enable row level security;

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

drop policy if exists bills_select_authenticated on public.bills;
create policy bills_select_authenticated
on public.bills
for select
to authenticated
using (public.current_app_role() is not null);

drop policy if exists payments_select_authenticated on public.payments;
create policy payments_select_authenticated
on public.payments
for select
to authenticated
using (public.current_app_role() is not null);

drop policy if exists payment_allocations_select_authenticated on public.payment_allocations;
create policy payment_allocations_select_authenticated
on public.payment_allocations
for select
to authenticated
using (public.current_app_role() is not null);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, email, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), new.email),
    new.email,
    coalesce(
      (
        select invitation.role
        from public.user_invitations as invitation
        where invitation.email = lower(new.email)
          and invitation.accepted_at is null
        order by invitation.created_at desc
        limit 1
      ),
      'viewer'
    ),
    exists (
      select 1
      from public.user_invitations as invitation
      where invitation.email = lower(new.email)
        and invitation.accepted_at is null
    )
  )
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email;

  update public.user_invitations
  set accepted_at = timezone('utc', now()),
      accepted_by = new.id
  where email = lower(new.email)
    and accepted_at is null;

  return new;
end;
$$;
-- END: sql/009_pending_user_activation.sql

-- ==========================================
-- BEGIN: sql/010_add_group_table.sql
-- ==========================================
-- Create Group table
CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(category, sub_category)
);

-- Create index on category
CREATE INDEX idx_groups_category ON groups(category);

-- Add group_id column to customers table if it doesn't exist
ALTER TABLE customers ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id);

-- Create index on customer.group_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_customers_group_id ON customers(group_id);

-- Insert default group
INSERT INTO groups (category, sub_category) 
VALUES ('Default', 'General')
ON CONFLICT (category, sub_category) DO NOTHING;

-- Update existing customers without a group to use the default group
UPDATE customers 
SET group_id = (SELECT id FROM groups WHERE category = 'Default' AND sub_category = 'General')
WHERE group_id IS NULL;

-- Enable RLS on groups table
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for groups table
-- Policy for SELECT - all authenticated users can read groups
DROP POLICY IF EXISTS groups_select_authenticated ON groups;
CREATE POLICY groups_select_authenticated
ON groups
FOR SELECT
TO authenticated
USING (is_active = true);

-- Policy for INSERT - only admin and collaborator can create groups
DROP POLICY IF EXISTS groups_insert_team ON groups;
CREATE POLICY groups_insert_team
ON groups
FOR INSERT
TO authenticated
WITH CHECK (public.current_app_role() IN ('admin', 'collaborator'));

-- Policy for UPDATE - only admin and collaborator can update groups
DROP POLICY IF EXISTS groups_update_team ON groups;
CREATE POLICY groups_update_team
ON groups
FOR UPDATE
TO authenticated
USING (public.current_app_role() IN ('admin', 'collaborator'))
WITH CHECK (public.current_app_role() IN ('admin', 'collaborator'));

-- Policy for DELETE - only admin can delete groups
DROP POLICY IF EXISTS groups_delete_admin ON groups;
CREATE POLICY groups_delete_admin
ON groups
FOR DELETE
TO authenticated
USING (public.current_app_role() = 'admin');

-- END: sql/010_add_group_table.sql

