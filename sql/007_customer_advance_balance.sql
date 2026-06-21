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