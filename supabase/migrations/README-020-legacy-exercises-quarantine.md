# Legacy exercises table quarantine (migration-020 / 021)

## Steps

1. **Preflight**  
   Run `preflight-020-legacy-exercises.sql` in the Supabase Dashboard SQL Editor and keep the results (table existence, row counts, grants, RLS status).

2. **Apply quarantine**  
   Run `migration-020-quarantine-exercises.sql` in the Supabase Dashboard SQL Editor (production/staging).

3. **Post-migration verification**  
   Run `postflight-020-verify.sql` in the same editor. Confirm:
   - 0 grants for anon/authenticated/PUBLIC on the three tables
   - RLS enabled and forced on each table
   - One policy per table: `*_service_read_only` for `service_role`
   - `SET ROLE authenticated; SELECT count(*) FROM public.exercises;` throws permission denied
   - `SET ROLE service_role; SELECT count(*) FROM public.exercises;` succeeds

4. **Verification window**  
   For at least one beta release cycle (e.g. 1–2 sprints):
   - Supabase Dashboard → Logs → PostgREST: filter for `exercises` in path/body (expect zero).
   - Logs → Postgres: watch for `permission denied for table exercises` (expect zero new events).

5. **Drop (after window)**  
   When there are no blocked-access events:
   - Add `"migration-021-drop-deprecated-exercise-tables.sql"` to `manifest.json` after `migration-020-quarantine-exercises.sql`.
   - Run `migration-021-drop-deprecated-exercise-tables.sql` in the Supabase Dashboard SQL Editor.
