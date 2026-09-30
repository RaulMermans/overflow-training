-- ============================================================
-- Contract audit: start_workout_from_routine vs workout_exercises
-- Ensures the function's INSERT into workout_exercises only
-- references columns that exist in the table.
-- Run: psql $DATABASE_URL -f scripts/db/contract_audit.sql
--      or: supabase db execute --file scripts/db/contract_audit.sql
-- Exits with 0 on success; raises and exits non-zero on failure.
-- ============================================================

do $$
declare
  v_def       text;
  v_cols_raw  text;
  v_col       text;
  v_missing   text[] := '{}';
  v_table_cols text[];
begin
  -- Get function source (current version in DB)
  select pg_get_functiondef(oid)
  into v_def
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname = 'start_workout_from_routine';

  if v_def is null then
    raise exception 'CONTRACT_AUDIT: function public.start_workout_from_routine not found';
  end if;

  -- Extract INSERT column list: first (...) after "insert into public.workout_exercises"
  v_cols_raw := substring(
    v_def
    from 'insert into public\.workout_exercises\s*\(\s*([^)]+)\s*\)'
  );

  if v_cols_raw is null then
    raise exception 'CONTRACT_AUDIT: could not parse INSERT column list from start_workout_from_routine';
  end if;

  -- Table columns for workout_exercises
  select array_agg(column_name order by ordinal_position)
  into v_table_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'workout_exercises';

  if v_table_cols is null then
    raise exception 'CONTRACT_AUDIT: table public.workout_exercises not found';
  end if;

  -- Check each referenced column exists (split by comma, trim)
  for v_col in
    select trim(both from elem)
    from unnest(string_to_array(regexp_replace(v_cols_raw, '\s+', ' ', 'g'), ',')) as elem
  loop
    if v_col is not null and v_col <> '' and not (v_col = any(v_table_cols)) then
      v_missing := array_append(v_missing, v_col);
    end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception 'CONTRACT_AUDIT: start_workout_from_routine INSERT references columns not in workout_exercises: %',
      array_to_string(v_missing, ', ');
  end if;

  raise notice 'CONTRACT_AUDIT: OK — start_workout_from_routine INSERT columns match workout_exercises';
end;
$$;
