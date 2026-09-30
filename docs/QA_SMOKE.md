# QA Smoke Checklist

## 1) Fresh Install + Sign In + Navigation

1. Install a fresh build on iOS simulator/device.
2. Sign in with a valid account.
3. Open each main tab (Workout, Calendar, Progress, Profile) and confirm each screen renders without crash/loading lock.

## 2) Routine Create/Edit/Save

1. Go to Routines and create a new routine.
2. Add multiple exercises.
3. Save routine.
4. Reopen the routine, edit the name or order, and save.

## 3) Workout Session Core Flow

1. Start a workout from a routine or quick start.
2. Add at least one set.
3. Trigger rest timer and wait/skip once.
4. Finish workout and confirm navigation returns to workout/home context.

## 4) Airplane Mode Offline Safety

1. Enable Airplane Mode.
2. Start workout, log at least one set, and finish workout.
3. Confirm app remains interactive (no stuck modal/spinner).
4. Confirm sync UI indicates pending/offline state.

## 5) Multi-User Isolation

1. Log out from User A.
2. Log in as User B.
3. Confirm User A private data does not appear (routines/workouts/progress/check-ins/outbox artifacts).

## 6) Progress Screen States

1. For a new/empty account, open Progress and confirm empty state renders.
2. For an account with workout history, open Progress and confirm charts/cards render with data.

## 7) Account Deletion (P0)

Full runbook: [`docs/QA_ACCOUNT_DELETE.md`](./QA_ACCOUNT_DELETE.md).

Quick smoke:

1. Create a fresh test user.
2. Log a workout, create a routine, favorite an exercise.
3. Profile → Delete Account → type `DELETE` → confirm.
4. Expected: spinner unlocks, app returns to auth screen within ~3s.
5. Attempt sign-in with deleted credentials → must fail.
