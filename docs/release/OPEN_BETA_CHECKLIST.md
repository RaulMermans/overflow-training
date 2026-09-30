# Open Beta Preflight

Use this checklist before every public TestFlight beta build.

## 1. Deterministic preflight

Run:

```bash
npm run preflight:beta
```

This is the only required local gate before beta smoke QA. It already covers:

- `check:node-modules-integrity`
- `check:no-duplicate-suffix-files`
- `check:env:release`
- `db:verify:contract`
- `typecheck`
- Jest
- `lint:no-new-debt`
- `lint:no-hex`
- `release:identity`

If this fails, do not build a beta candidate.

## 2. Manual beta smoke

Run this on at least one smaller iPhone simulator/device and one larger iPhone.

### Core flows

1. Fresh install -> sign in with an email/password test account -> open Workout, Calendar, Progress, and Profile.
2. Logged-out state -> **Continue with Google** -> verify the app returns through `login-callback` and lands in onboarding or Workout based on account state.
3. Calendar -> tap a day without a plan -> open routine picker.
4. Verify routine picker header, search, results, and footer all stay visible with no clipping.
5. Calendar -> planned workout -> start workout -> reach session root.
6. Workout session -> add a set -> finish a scheduled workout -> return to Workout tab.
7. Start an ad hoc workout from Today -> add a set -> finish -> return to Workout tab.
8. Confirm an unfinished workout remains resumable if you back out without finishing.

### Beta hardening checks

1. Profile -> change weekly goal -> return to Today -> content stays visible while values refresh.
2. Calendar -> return to Today -> no full-screen "Loading today" flash if data was already visible.
3. After workout completion, verify Progress/Today reflect the finished session once sync completes.
4. On onboarding or other long-form screens, scroll to the last control and confirm it is visible and tappable above the bottom CTA.
5. If the Google account is new, complete onboarding without creating a password and confirm the app treats the session as fully authenticated.
6. Forgot password -> email link -> app opens `reset-password` -> set a new password -> return to the app successfully.

### Account management and legal checks

7. Profile -> Legal -> tap Privacy Policy -> correct URL opens in browser.
8. Profile -> Legal -> tap Terms of Service -> correct URL opens in browser.
9. Profile -> Legal -> tap Contact Support -> mail compose opens with correct address.
10. Profile -> Account -> tap Delete Account -> confirm modal appears, typing "DELETE" enables the button, tapping cancel dismisses safely.
11. Verify account deletion flow completes and signs the user out. **Use a throwaway test account — deletion is irreversible.**

### Failure semantics

1. Put the app in an offline or delayed-sync state.
2. Finish a workout.
3. Confirm the UI does not pretend the server write is already durable.
4. Confirm the user sees pending/local-save messaging and the app remains interactive.

## 3. Release handoff

If both the deterministic preflight and manual smoke pass:

1. Follow [`docs/RELEASE_TESTFLIGHT.md`](../RELEASE_TESTFLIGHT.md) for the build/submit steps.
2. Use [`docs/TESTFLIGHT_GO_NO_GO.md`](../TESTFLIGHT_GO_NO_GO.md) for final release sign-off.
