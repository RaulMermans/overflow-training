-- Migration 012: full account deletion RPC (auth user + owned app data).
-- Safe to run multiple times.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requesting_user_id uuid;
begin
  requesting_user_id := auth.uid();

  if requesting_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  delete from public.workouts
  where user_id = requesting_user_id;

  delete from public.routines
  where user_id = requesting_user_id;

  delete from public.plans
  where user_id = requesting_user_id;

  delete from public.exercise_favorites
  where user_id = requesting_user_id;

  delete from public.routine_favorites
  where user_id = requesting_user_id;

  delete from public.user_settings
  where user_id = requesting_user_id;

  delete from public.exercise_definitions
  where owner_user_id = requesting_user_id;

  delete from auth.users
  where id = requesting_user_id;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
