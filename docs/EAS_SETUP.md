# EAS Build + Submit Setup

One-time setup for building and submitting to TestFlight via Expo Application
Services (EAS). Complete these steps before your first production build.

---

## Prerequisites

- **Apple Developer Program** membership (paid — required for TestFlight and App Store)
- **Node.js 18+**
- **EAS CLI**: `npm install -g eas-cli` (or use `npx eas-cli` without global install)

---

## 1. EAS Login

```bash
eas login
```

Verify you are logged in:

```bash
eas whoami
```

---

## 2. EAS Environment Variables

Environment variables must be stored in the EAS environment used by the build
profile so they are injected at build time. Never commit `.env` to source control.

```bash
npx eas-cli env:create \
  --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://YOUR_PROJECT.supabase.co" \
  --environment production \
  --visibility plaintext

npx eas-cli env:create \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "YOUR_ANON_KEY" \
  --environment production \
  --visibility plaintext

npx eas-cli env:create \
  --name EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID \
  --value "YOUR_EXISTING_IOS_CLIENT_ID.apps.googleusercontent.com" \
  --environment production \
  --visibility plaintext
```

Where to find these values:

- **Supabase Dashboard** > your project > **Settings** > **API**
- `EXPO_PUBLIC_SUPABASE_URL` = Project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` = `anon` / `public` key
- `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` = the existing iOS OAuth client ID for bundle id `com.workout-tracker.ios`

Verify:

```bash
npx eas-cli env:list --environment production
```

`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and
`EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` should
appear in the output.

If Google Calendar should be testable in preview/TestFlight, set
`EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` in the exact EAS environment used by that build profile
(`preview`, `production`, or both). Changing it later requires a new EAS build and a new install of
that build or TestFlight version.

---

## 3. Auth Redirect Configuration

EAS env vars are not enough for auth. Google OAuth and password reset also depend
on Supabase and Google Cloud dashboard settings matching the app code.

Canonical values:

- App scheme: `workout-tracker-ios`
- Google Cloud OAuth client type: `Web application`
- Google Cloud Authorized redirect URI:
  `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase Site URL: `https://www.raulmermans.com`
- Supabase Redirect URLs:
  - `workout-tracker-ios://login-callback`
  - `workout-tracker-ios://reset-password`

Where to configure them:

- **Google Cloud Console** > APIs & Services > Credentials
  - Create or edit the Google OAuth client as a **Web application**
  - Add the Supabase HTTPS callback under **Authorized redirect URIs**
- **Supabase Dashboard** > Authentication > Providers > Google
  - Paste the Google **Client ID** and **Client Secret**
- **Supabase Dashboard** > Authentication > URL Configuration
  - Set **Site URL** to `https://www.raulmermans.com`
  - Add both app deep links under **Redirect URLs**

Behavior:

- Google sign-in redirects to `workout-tracker-ios://login-callback`
- Password reset redirects to `workout-tracker-ios://reset-password`
- Google Calendar sync redirects to `workout-tracker-ios://google-calendar-callback`
- New Google users are fully authenticated and can continue through onboarding
  without creating a password

Potential footguns:

- Do not use `workout-tracker-ios://reset-password` as the Supabase Site URL
- Do not put the app deep links into Google Cloud Authorized redirect URIs
- Do not leave placeholder redirect URLs in Supabase
- Google Calendar sync uses the existing iOS OAuth client ID only; do not ship a client secret in the app
- Supabase Google sign-in remains separate and keeps the Web client secret only in the Supabase Dashboard

---

## 4. Apple Team ID

Your Apple Team ID is a 10-character alphanumeric string.

**Where to find it:**

1. Go to [developer.apple.com](https://developer.apple.com)
2. Sign in > **Account** > **Membership Details**
3. Copy the **Team ID** value (e.g. `A1B2C3D4E5`)

**How to set it:**

Open `eas.json` and replace the placeholder:

```json
"submit": {
  "production": {
    "ios": {
      "appleTeamId": "A1B2C3D4E5"
    }
  }
}
```

> Note: Apple Team ID is a public identifier (visible on App Store listings).
> Committing it to `eas.json` is safe — it is not a secret.

---

## 5. App Store Connect App ID

You need a numeric App ID from App Store Connect (ASC).

**Steps to create the app record in ASC:**

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. **My Apps** > **+** > **New App**
3. Fill in:
   - **Platform**: iOS
   - **Name**: `Overflow` (or your desired display name)
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: Select `com.workout-tracker.ios` (must match `app.json`)
   - **SKU**: `workout-tracker-ios-1` (any unique identifier)
4. Click **Create**
5. On the **App Information** page, find the **Apple ID** field — this is your
   numeric App Store Connect App ID (e.g. `1234567890`)

**How to set it:**

Open `eas.json` and replace the placeholder:

```json
"submit": {
  "production": {
    "ios": {
      "ascAppId": "1234567890",
      "appleTeamId": "A1B2C3D4E5"
    }
  }
}
```

> Note: The ASC App ID is also a public identifier. Safe to commit.

---

## 6. Apple Credentials (Code Signing)

On the first build, EAS will prompt for Apple credentials.

**Option A (Recommended)**: Let EAS manage certificates and provisioning
profiles automatically. EAS generates and stores them securely on their
servers. This is the simplest path.

**Option B**: Provide your own `.p12` certificate and `.mobileprovision` file.
EAS will prompt you to upload them.

This is a one-time setup per Apple Developer account. Subsequent builds reuse
the stored credentials.

---

## 7. Verify Setup

Run a development build as a smoke test:

```bash
npx eas-cli build --platform ios --profile development
```

Check build status:

```bash
npx eas-cli build:list
```

If the build succeeds, your EAS configuration is correct and you can proceed
to preview and production builds (see [`docs/RELEASE_TESTFLIGHT.md`](./RELEASE_TESTFLIGHT.md)).

---

## Checklist Summary

- [ ] `eas login` — logged in
- [ ] EAS env vars set — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` when Google Calendar sync is enabled
- [ ] Auth redirect configuration matches the canonical values above
- [ ] `eas.json` — `appleTeamId` replaced with real Team ID
- [ ] `eas.json` — `ascAppId` replaced with real ASC App ID
- [ ] App record exists in App Store Connect with bundle ID `com.workout-tracker.ios`
- [ ] Development build succeeds
