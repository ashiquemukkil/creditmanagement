create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), new.email),
    new.email,
    'viewer'
  )
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

insert into public.users (id, name, email, role)
select
  auth_user.id,
  coalesce(auth_user.raw_user_meta_data ->> 'name', split_part(auth_user.email, '@', 1), auth_user.email),
  auth_user.email,
  'viewer'
from auth.users as auth_user
left join public.users as public_user on public_user.id = auth_user.id
where public_user.id is null;