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
