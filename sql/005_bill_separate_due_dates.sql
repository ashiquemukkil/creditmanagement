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