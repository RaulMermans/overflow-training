# Outbox Create-Only Verification

Improvement #1: `create_workout` outbox events use an insert-only path so late replay **never** overwrites a completed workout or downgrades `status` from `completed` to `in_progress`.

## Grep Gate

Before merging, search the repo for upserts that could downgrade workouts:

```bash
rg "\.upsert\(|upsertWorkout" --type ts -A 5 | rg -v "ignoreDuplicates"
```

- **create_workout** must go through `insertWorkoutIfMissingFromClient` (insert with `ignoreDuplicates: true`).
- No upsert on `workouts` should include `status: 'in_progress'` where the target row might already exist with `status: 'completed'`.

## Manual Repro Test

1. Create a workout and finish it (status = `completed`).
2. Force a pending outbox `create_workout` replay for the same `client_uuid` (e.g. re-enqueue event or toggle offline/online).
3. Verify in Supabase that the workout row remains `status = 'completed'` and `ended_at` is unchanged.

## SQL Verification Snippet

Use in Supabase SQL Editor to spot-check workouts after testing:

```sql
SELECT id, client_uuid, status, started_at, ended_at, updated_at
FROM public.workouts
WHERE user_id = auth.uid()
ORDER BY started_at DESC
LIMIT 10;
```

Confirm no row regressed from `completed` to `in_progress` after an outbox flush.
