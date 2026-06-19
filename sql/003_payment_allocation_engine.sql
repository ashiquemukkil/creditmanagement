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
  v_outstanding_amount numeric(12, 2);
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
    select
      b.id,
      b.amount,
      b.amount_paid,
      b.item_type,
      b.due_date,
      greatest((current_date - b.due_date), 0) as overdue_for_display,
      (current_date - b.due_date) as overdue_sort_value
    from public.bills as b
    where b.customer_id = p_customer_id
      and b.status in ('open', 'partial')
      and b.amount_paid < b.amount
    order by
      (current_date - b.due_date) desc,
      case when b.item_type = 'gold' then 0 else 1 end asc,
      b.due_date asc,
      b.bill_date asc,
      b.created_at asc,
      b.id asc
    for update
  loop
    exit when v_remaining_amount <= 0;

    v_outstanding_amount := round((v_bill.amount - v_bill.amount_paid)::numeric, 2);

    if v_outstanding_amount <= 0 then
      continue;
    end if;

    v_allocation_amount := least(v_remaining_amount, v_outstanding_amount);

    if v_allocation_amount <= 0 then
      continue;
    end if;

    insert into public.payment_allocations (
      payment_id,
      bill_id,
      amount_allocated
    )
    values (
      v_payment_id,
      v_bill.id,
      round(v_allocation_amount::numeric, 2)
    );

    update public.bills
    set
      amount_paid = round((amount_paid + v_allocation_amount)::numeric, 2),
      status = case
        when round((amount_paid + v_allocation_amount)::numeric, 2) >= amount then 'closed'
        when round((amount_paid + v_allocation_amount)::numeric, 2) > 0 then 'partial'
        else 'open'
      end
    where id = v_bill.id;

    v_remaining_amount := round((v_remaining_amount - v_allocation_amount)::numeric, 2);
  end loop;

  return v_payment_id;
end;
$$;

grant execute on function public.create_payment_with_allocations(uuid, date, numeric, text) to authenticated;