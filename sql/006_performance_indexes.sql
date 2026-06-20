-- Composite indexes for common filter + sort patterns in app queries.
create index if not exists idx_bills_status_created_at on public.bills (status, created_at desc);
create index if not exists idx_bills_customer_status_created_at on public.bills (customer_id, status, created_at desc);

create index if not exists idx_payments_customer_payment_date_created_at on public.payments (customer_id, payment_date desc, created_at desc);
create index if not exists idx_payments_payment_date_created_at on public.payments (payment_date desc, created_at desc);

create index if not exists idx_payment_allocations_payment_created_at on public.payment_allocations (payment_id, created_at desc);
