# QA: Phase 4 — Immediate Cloud Save

Verification checklist for "Option B: Immediate Cloud Save" — routines persist to Supabase at save time without the routinesPlans sync engine.

## Prerequisites

- `ENABLE_ROUTINE_PLAN_SYNC = false` (confirmed in `src/config/featureFlags.ts`)
- `.env` configured with valid Supabase credentials
- iOS Simulator or device

## Manual Verification Checklist

### 1. Create routine with 1 item → save → verify in Supabase

1. Sign in
2. Navigate to Routines → New routine
3. Enter name, add ≥1 exercise
4. Tap "Save routine"
5. **Expected:** Navigate to routine detail; no error
6. **Verify in Supabase:** `public.routines` contains a row with `client_uuid` matching the routine id; `public.routine_items` has ≥1 row for that `routine_id`

### 2. Schedule that routine → no `routine_not_found`

1. From the routine created above, or any routine with items
2. Go to Calendar tab
3. Tap a day → "Plan" → pick the routine
4. **Expected:** Plan is set; no "routine not found" or similar error
5. **Verify:** Day shows the planned routine in the day sheet

### 3. Start scheduled workout → succeeds

1. With a day that has a planned routine (from step 2)
2. Tap the day → "Start workout"
3. **Expected:** Workout session starts with exercises from the routine
4. **No:** "This routine is no longer available" or `routine_not_found`-type message

### 4. Edit routine (rename) → cloud updated

1. Open a routine → rename via "Edit name"
2. Save
3. **Expected:** Name saved; no error (or offline message if disconnected)
4. **Verify in Supabase:** `routines.name` matches the new name

### 5. Save routine from workout → cloud persisted

1. Complete or partially complete a workout
2. Open workout detail → "Save as routine"
3. Enter name, save
4. **Expected:** "Routine saved" (or saved-locally message if offline)
5. **Verify in Supabase:** New routine row; items match workout exercises

### 6. Offline behavior

1. Disable network (airplane mode or simulator)
2. Create a new routine with ≥1 exercise → Save
3. **Expected:** Alert "Saved locally. Connect to sync before scheduling."
4. **Expected:** Navigate to routine detail
5. Re-enable network; schedule the routine on a day
6. **Expected:** Plan succeeds (retry flow pushes routine, then schedules)

## Known Limitations

- **Offline:** Routines are saved locally first; cloud save may fail. User sees "Saved locally. Connect to sync before scheduling." Scheduling will push the routine on first attempt (retry flow).
- **No background sync:** The routinesPlans sync engine is disabled. All cloud persistence happens at explicit save actions or at schedule-time retry.
- **Empty routines:** RPC rejects empty items (`routine_empty`). UI validates before save; retry flow only runs when routine has ≥1 item.

## Commands Run

```bash
npm install
npm run ios
npm test
```

## Files Changed (summary)

| Path                                            | Change                                                     |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `src/db/routineCloudPayload.ts`                 | New shared mapper `toCloudRoutinePayload`                  |
| `src/features/sync/routinesPlans/syncEngine.ts` | Import mapper from shared module                           |
| `app/(app)/routines/new.tsx`                    | Immediate cloud save after local save                      |
| `app/(app)/routines/[id].tsx`                   | Cloud save on rename + pin toggle                          |
| `app/(app)/workouts/[id].tsx`                   | Cloud save on "Save as routine"                            |
| `app/(app)/(tabs)/calendar.tsx`                 | Retry: push routine then reschedule on `routine_not_found` |
| `src/i18n/translations/en.ts`                   | `routine.new.savedLocallyOffline`                          |
| `src/i18n/translations/es.ts`                   | Same                                                       |
