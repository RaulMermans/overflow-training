# Environment Configuration

This app always requires two public Supabase variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Google Calendar sync adds one conditional public variable:

- `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`

This third variable is required for release/CI builds when `ENABLE_GOOGLE_CALENDAR_SYNC`
is `true`, and for local development only when you want to exercise the Google Calendar flow.

Security rule:

- `SUPABASE_SERVICE_ROLE_KEY` must never be present in app runtime/build env (`.env`, CI, EAS, or `EXPO_PUBLIC_*`).
- `npm run check:env` fails if a service-role key is detected or if `EXPO_PUBLIC_SUPABASE_ANON_KEY` decodes to `service_role`.

## Local setup

1. Copy the template:

```bash
cp .env.example .env
```

2. Edit `.env` and set both values:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

3. If you are testing Google Calendar locally, also set:

```bash
EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=your-existing-ios-client-id.apps.googleusercontent.com
```

Use the existing iOS OAuth client for bundle id `com.workout-tracker.ios`. Do not create
or embed a client secret in the app.

4. Optional sanity check:

```bash
npm run check:env
```

If the Google Calendar client ID is missing locally while the feature flag is on, `check:env`
prints a note instead of failing. The Google Calendar entry point stays hidden in the normal UI for
that build, and direct/manual navigation shows a missing-config state.

## EAS setup (production)

Set the required variables in the Expo/EAS environment used by the build profile.
For TestFlight/App Store builds in this repo that is `production`; if you use preview builds for QA,
set the same values in `preview` too.

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://your-project-ref.supabase.co" --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key" --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID --value "your-existing-ios-client-id.apps.googleusercontent.com" --environment production --visibility plaintext
eas env:list --environment production
```

After changing `EXPO_PUBLIC_*` values, rebuild the app binary and reinstall/update that build.
These values are inlined at build time, so an existing preview/TestFlight install will not change.

When `ENABLE_GOOGLE_CALENDAR_SYNC` is `true`, `npm run check:env:release` fails if
`EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is missing from the selected release environment.

## Auth redirect configuration (not env vars)

Google OAuth and password reset also require dashboard-managed settings. These are
not stored in `.env` or EAS variables.

Canonical values:

- App scheme: `workout-tracker-ios`
- Google Cloud OAuth client type: `Web application`
- Google Cloud Authorized redirect URI:
  `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase Site URL: `https://www.raulmermans.com`
- Supabase Redirect URLs:
  - `workout-tracker-ios://login-callback`
  - `workout-tracker-ios://reset-password`

Behavior:

- Google sign-in uses `login-callback`
- Password reset uses `reset-password`
- Google Calendar sync uses `google-calendar-callback`
- New Google users are fully authenticated users and can continue through
  onboarding without creating a password

Footguns:

- Do not use `workout-tracker-ios://reset-password` as the Supabase Site URL
- Do not put the app deep links into Google Cloud Authorized redirect URIs
- Google Calendar sync is separate from Supabase Google sign-in and uses the existing
  iOS OAuth client ID via `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`
- The app never stores or ships a Google client secret

## Optional local sync

You can pull environment variables to local files:

```bash
eas env:pull --environment production
```

This repo does not programmatically set EAS environment variables. Operators must
configure them in Expo/EAS before building.

## PostHog Analytics (Optional)

PostHog provides product analytics. The app works normally without these variables.

### Local setup

Add to `.env`:

```bash
EXPO_PUBLIC_POSTHOG_KEY=phc_your_key_here
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

**Hosts**: US Cloud `https://us.i.posthog.com` | EU Cloud `https://eu.i.posthog.com`

### EAS setup (production)

```bash
eas env:create --name EXPO_PUBLIC_POSTHOG_KEY --value "phc_your_key_here" --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_POSTHOG_HOST --value "https://us.i.posthog.com" --environment production --visibility plaintext
```

After changing `EXPO_PUBLIC_*` values, rebuild the binary.

### Privacy

PostHog is configured to never capture email addresses or PII. Only hashed user IDs
and explicit events are tracked. If `EXPO_PUBLIC_POSTHOG_KEY` is not set, all analytics
calls no-op silently.
