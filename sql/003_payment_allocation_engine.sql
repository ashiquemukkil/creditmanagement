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