# External Setup

Everything below must be completed outside the repo before Google Calendar sync can work end-to-end.

## 1. Google Cloud

### Calendar API enablement

In the Google Cloud project used for this app:

1. Open **APIs & Services → Library**
2. Enable **Google Calendar API**

### OAuth consent

In **APIs & Services → OAuth consent screen**:

- include these scopes:
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/calendar.readonly`
- add internal test users until the app is verified
- submit for Google verification when moving beyond internal testing if Google requires it

### OAuth client

Reuse the existing **iOS** OAuth client from Google Cloud Console. Do **not** create a new client as part of this activation path.

To verify or locate the existing client:

1. Open **APIs & Services → Credentials**
2. Look for an iOS-type OAuth 2.0 Client ID with bundle identifier `com.workout-tracker.ios`
3. Copy its Client ID (ends in `.apps.googleusercontent.com`)

If the expected client is missing, stop and resolve that in Google Cloud before shipping. The repo assumes an existing iOS client already exists.

Google Calendar sync uses this existing iOS Client ID directly. Supabase Google sign-in remains a separate flow and keeps its own Web client credentials in the Supabase Dashboard.

### Callback URI

The app callback used by the Calendar flow is:

```text
workout-tracker-ios://google-calendar-callback
```

For the iOS OAuth client, Google uses the bundle/scheme pairing. There is no web redirect URI to add for this client.

## 2. Supabase Provider Config

No new Supabase provider configuration is required for the Calendar integration itself.

The existing app auth flow still needs the current Google sign-in provider setup for login:

- Google provider configured in Supabase
- Supabase auth callback:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

- app redirect URLs already allowlisted for login and password reset

Calendar sync is separate from that login flow and uses the direct iOS Google OAuth client above.

## 3. Supabase Database

Ensure [`migration-041-google-calendar-sync.sql`](supabase/migrations/migration-041-google-calendar-sync.sql) has been applied to the target Supabase project.

This provides:

- `google_calendar_connections`
- `scheduled_workout_calendar_links`
- RLS and timestamps needed by the feature

## 4. Environment Variables

### Local development

Add to `.env` (not committed):

```bash
EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=<ios-oauth-client-id>.apps.googleusercontent.com
```

### EAS builds (production / preview)

Add the same variable to the EAS environment used by the build profile:

```bash
eas env:create --name EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID \
  --value "your-existing-ios-client-id.apps.googleusercontent.com" \
  --environment production \
  --visibility plaintext
```

Set it in every EAS environment where Google Calendar should appear. In this repo that usually means:

- `preview` for preview/internal QA builds
- `production` for TestFlight / App Store builds

### Supabase Google provider (sign-in only — not Calendar)

The **Web** OAuth Client ID and Client Secret are configured in the Supabase Dashboard, not in the app env:

1. **Supabase Dashboard → Authentication → Providers → Google**
2. Paste the **Web** Client ID and **Web** Client Secret there
3. These are the Web-type credentials from Google Cloud (separate from the iOS client)

> The Calendar sync feature does **not** use a Client Secret — it uses PKCE with the iOS Client ID only.

Without `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`, the Google Calendar entry point stays hidden in the normal UI for that build. If the screen is reached directly, it shows a missing-config message and keeps the connect action disabled.

## 5. Feature Activation

The feature flag `ENABLE_GOOGLE_CALENDAR_SYNC` is already `true`. The normal UI entry point only appears when `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is present in the build. To fully activate:

1. Complete Google Cloud Console setup (sections 1-4 above)
2. Set `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` in `.env` (local) and in the exact EAS environment used for the target build profile
3. Trigger a new EAS build (the variable is baked in at build time)
4. Install that new build or new TestFlight version; an existing binary will not pick up the change
5. Run the QA checklist before wider exposure

## 6. Test Account Checklist

- Google account has at least one writable calendar
- Google account is added as a test user if the consent screen is still restricted
- Account can complete the same consent scopes listed above
- Account is available on the iOS simulator / test device for the browser handoff

## 7. Rollout Order

1. Enable **Google Calendar API** in Google Cloud Console
2. Locate the existing iOS OAuth client with bundle id `com.workout-tracker.ios`
3. Confirm consent screen includes `calendar.events` and `calendar.readonly` scopes; add test users
4. Apply migration 041 on the target Supabase environment
5. Set `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` in `.env` (local) and in the exact EAS environment used for the build
6. Run [`qa-checklist.md`](docs/google-calendar-sync/qa-checklist.md)
7. Start internal testing

## 8. Where Secrets Live — Quick Reference

| Secret                  | Where to set it                             | Notes                                                                     |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| iOS OAuth Client ID     | `.env` + EAS env vars                       | `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` — public, safe to expose client-side |
| Web OAuth Client ID     | Supabase Dashboard → Auth → Google provider | Used for Google sign-in only, not Calendar                                |
| Web OAuth Client Secret | Supabase Dashboard → Auth → Google provider | **Never** in app code or env — server-side only                           |
| Supabase URL / Anon Key | `.env` + EAS env vars                       | Already configured                                                        |

## 9. Redirect URIs — Quick Reference

| Flow                      | Redirect URI                                     | Where to register                                                 |
| ------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| Google Calendar PKCE      | `workout-tracker-ios://google-calendar-callback` | iOS client uses bundle/scheme — no manual URI registration needed |
| Google sign-in (Supabase) | `workout-tracker-ios://login-callback`           | Supabase Dashboard → Auth → URL Configuration → Redirect URLs     |
| Password reset            | `workout-tracker-ios://reset-password`           | Supabase Dashboard → Auth → URL Configuration → Redirect URLs     |
