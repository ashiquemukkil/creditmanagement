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