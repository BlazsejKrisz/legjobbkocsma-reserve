-- Fix assign_user_role: replace all existing roles instead of adding on top.
-- A user should have exactly one role at a time.
create or replace function public.assign_user_role(
  p_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role) values (p_user_id, p_role);
end;
$$;
