alter table public.bills
  add column if not exists gold_amount numeric(12, 2) not null default 0,
  add column if not exists diamond_amount numeric(12, 2) not null default 0,
  add column if not exists gold_due_date date,
  add column if not exists diamond_due_date date,
  add column if not exists amount_paid_gold numeric(12, 2) not null default 0,
  add column if not exists amount_paid_diamond numeric(12, 2) not null default 0;

alter table public.payment_allocations
  add column if not exists allocated_to text;

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
  end;

update public.payment_allocations as pa
set allocated_to = b.item_type
from public.bills as b
where pa.bill_id = b.id
  and pa.allocated_to is null;

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