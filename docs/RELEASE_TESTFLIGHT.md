# TestFlight Release Runbook

Deterministic checklist to build and submit the app to TestFlight via EAS.
Complete each section in order. Do not skip ahead — earlier steps gate later ones.

> First-time setup? Complete [`docs/EAS_SETUP.md`](./EAS_SETUP.md) before
> starting this runbook.

---

## 1. Preflight Checks

Run the repo beta gate first. Every check must pass before proceeding.

```bash
npm run preflight:beta
```

If any check fails, fix the issue before continuing.

Then run the manual smoke list in
[`docs/release/OPEN_BETA_CHECKLIST.md`](./release/OPEN_BETA_CHECKLIST.md).

---

## 2. Supabase Schema Verify

1. Open **Supabase Dashboard** > **SQL Editor** > **New query**
2. Paste the entire contents of [`docs/SUPABASE_VERIFY_ALL.sql`](./SUPABASE_VERIFY_ALL.sql)
3. Click **Run**
4. Compare each result grid to the expected outputs in
   [`docs/SUPABASE_VERIFY.md`](./SUPABASE_VERIFY.md) > "Quick Verify" section

All 9 sections must pass. If any fail, resolve per the instructions in
`SUPABASE_VERIFY.md` > "If mismatched" before continuing.

---

## 3. Auth Redirect Configuration

Verify these values before any preview or production build. Google Cloud,
Supabase, and the app code must stay aligned.

| Setting                              | Value                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| App scheme                           | `workout-tracker-ios`                                                             |
| Google Cloud OAuth client type       | `Web application`                                                                 |
| Google Cloud Authorized redirect URI | `https://<project-ref>.supabase.co/auth/v1/callback`                              |
| Supabase Site URL                    | `https://www.raulmermans.com`                                                     |
| Supabase Redirect URLs               | `workout-tracker-ios://login-callback` and `workout-tracker-ios://reset-password` |

### Supabase configuration

In **Supabase Dashboard** > **Authentication** > **URL Configuration**:

- Set **Site URL** to `https://www.raulmermans.com`
- Add both redirect URLs:
  - `workout-tracker-ios://login-callback`
  - `workout-tracker-ios://reset-password`

In **Authentication** > **Providers** > **Google**:

- Store the Google OAuth **Client ID** and **Client Secret** from the matching
  Google Cloud OAuth client
- Do not put app deep links into Google Cloud. Google redirects to Supabase first,
  then Supabase redirects into the app

Then verify the email template:

1. **Authentication** > **Email Templates** > **Reset Password**
2. Confirm the template body contains `{{ .ConfirmationURL }}`
3. The link resolves to `workout-tracker-ios://reset-password?...` after Supabase
   finishes the password-reset redirect

Potential footguns:

- Do not use `workout-tracker-ios://reset-password` as the Supabase Site URL
- Do not replace the Google Cloud redirect URI with the app deep link
- Do not leave placeholder redirect URLs such as `com.example.app://...`

### Manual QA: Google Sign-In Flow

Run this on the iOS Simulator or a physical device:

1. Start from a logged-out app
2. Tap **Continue with Google**
3. Complete Google consent
4. Verify the app returns through `workout-tracker-ios://login-callback`
5. Existing users should land in the app; new users should continue into onboarding
   without being asked to create a password

**Simulator shortcut** — test callback routing without running the full OAuth flow:

```bash
xcrun simctl openurl booted "workout-tracker-ios://login-callback?code=test-code"
```

This should open the login-callback screen. The code will fail validation, but the
route is confirmed.

### Manual QA: Password Reset Flow

Run this on the iOS Simulator or physical device:

1. Open the app > Login screen > tap **Forgot password?**
2. Enter a password-based test account email > tap **Send Reset Link**
3. Check the email (Inbucket for local Supabase, or a real inbox)
4. Click the reset link — the app should open at the **Reset Password** screen
5. Enter a new password in both fields > tap **Update Password**
6. Verify redirect to the Workout tab
7. Log out > log back in with the new password

Password reset only applies to password-based accounts. Google-only users do not
need to create a password to sign in or complete onboarding.

**Simulator shortcut** — test reset routing without email:

```bash
xcrun simctl openurl booted "workout-tracker-ios://reset-password?code=test-code"
```

This should open the reset-password screen. The code will fail validation, but the
route is confirmed.

---

## 4. EAS Build Environment

Verify the exact EAS environment used by the build profile is configured:

```bash
npx eas-cli env:list --environment production
```

Required values:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` when `ENABLE_GOOGLE_CALENDAR_SYNC` is `true`

If you are building `preview`, check `--environment preview` instead.
If any value is missing, see [`docs/EAS_SETUP.md`](./EAS_SETUP.md) Section 2.

After changing `EXPO_PUBLIC_*` values, trigger a new EAS build and install the new binary. An
existing TestFlight install will not pick up build-time env changes.

---

## 5. Build: Preview (Recommended First)

Build an internal-distribution preview to test on a physical device before
submitting to TestFlight.

```bash
npx eas-cli build --platform ios --profile preview
```

Register test devices if needed: `npx eas-cli device:create`

After the build completes:

1. Install on a registered device via the QR code or direct link from EAS
2. Run through the **20 manual test steps** in [`README.md`](../README.md)
3. Run the Google sign-in and password reset QA flows (Section 3 above)
4. If all pass, proceed to production build

---

## 6. Build: Production

```bash
npx eas-cli build --platform ios --profile production
```

Build number auto-increments via `appVersionSource: "remote"` in `eas.json`.
Wait for the build to complete.

---

## 7. Submit to TestFlight

After a successful production build:

```bash
npx eas-cli submit --platform ios --profile production
```

Or combine build + submit in one step:

```bash
npx eas-cli build --platform ios --profile production --auto-submit
```

---

## 8. Post-Submit Checklist

- [ ] **App Store Connect** > TestFlight tab: build appears
- [ ] **Processing** completes (typically 5-30 minutes)
- [ ] **Export compliance** answered — select **No** (the app uses only standard
      HTTPS encryption via Supabase; no custom cryptography)
- [ ] **Internal testing**: build is automatically available to ASC users;
      install from TestFlight and verify basic flows
- [ ] **Auth deep-link tests**: verify Google sign-in returns through
      `login-callback` and password reset returns through `reset-password`
- [ ] **External testing** (optional): add external testers or create a public
      TestFlight link under "External Testing"

### App Metadata (for eventual App Store submission)

These are not required for TestFlight but should be filled in ASC:

- [ ] App name and subtitle
- [ ] Description
- [ ] Keywords
- [ ] Category (Health & Fitness)
- [ ] Screenshots (iPhone 6.7" and 6.5" required minimum)
- [ ] App icon (1024x1024, provided via `assets/icon.png` at build time)
- [ ] Privacy policy URL
- [ ] Support URL

### Screenshot Alignment (Required Before Submission)

Use the canonical shot list in [`docs/APP_STORE_SCREENSHOT_MATRIX.md`](./APP_STORE_SCREENSHOT_MATRIX.md).

- [ ] Capture all required shots for iPhone 6.7" and iPhone 6.5"
- [ ] Verify copy is production-safe (no internal/dev/setup language)
- [ ] Verify screenshots reflect current UI and current tab order
- [ ] Verify first-time user story is understandable from screenshots alone

---

## 9. Auth Redirect Reference

| Item                      | Value                                                                 | Location                                                |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| Custom scheme             | `workout-tracker-ios`                                                 | `app.json`                                              |
| Supabase Site URL         | `https://www.raulmermans.com`                                         | Supabase Dashboard > Auth > URL Configuration           |
| Google Cloud redirect URI | `https://<project-ref>.supabase.co/auth/v1/callback`                  | Google Cloud OAuth client                               |
| Google app redirect       | `workout-tracker-ios://login-callback`                                | `src/auth/useAuth.tsx`, `app/(auth)/login-callback.tsx` |
| Password reset redirect   | `workout-tracker-ios://reset-password`                                | `src/auth/useAuth.tsx`, `app/(auth)/reset-password.tsx` |
| Auth gate bypass          | `login-callback` and `reset-password` stay reachable while logged out | `app/_layout.tsx`                                       |
| Associated domains        | Not needed for this custom-scheme setup                               | —                                                       |

---

## 10. Version Management

- **App version** (`version` in `app.json`): bump for user-visible releases
  (e.g. `1.0.0` → `1.1.0`)
- **Build number** (`buildNumber` in `app.json`): auto-incremented by EAS in
  production profile. No manual changes needed.
- After bumping `version`, commit the change before building.

---

## Quick Reference

| Action                 | Command                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| Run tests              | `npm test`                                                                     |
| Grep gate              | `grep -r "import.*supabase" app/`                                              |
| TypeScript check       | `npx tsc --noEmit`                                                             |
| Build for simulator    | `npx eas-cli build --platform ios --profile development`                       |
| Build for team testing | `npx eas-cli build --platform ios --profile preview`                           |
| Build for TestFlight   | `npx eas-cli build --platform ios --profile production`                        |
| Submit to TestFlight   | `npx eas-cli submit --platform ios --profile production`                       |
| Build + submit         | `npx eas-cli build --platform ios --profile production --auto-submit`          |
| Register test device   | `npx eas-cli device:create`                                                    |
| List secrets           | `npx eas-cli secret:list`                                                      |
| Check build status     | `npx eas-cli build:list`                                                       |
| Test Google callback   | `xcrun simctl openurl booted "workout-tracker-ios://login-callback?code=test"` |
| Test reset callback    | `xcrun simctl openurl booted "workout-tracker-ios://reset-password?code=test"` |
