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