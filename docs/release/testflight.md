# TestFlight: Store Build + Submit Runbook

Use this runbook to produce a store-distribution iOS build and submit it to TestFlight so it appears in App Store Connect.

## Prerequisites

- [ ] App Store Connect agreements are accepted: **App Store Connect → Agreements, Tax, and Banking**
- [ ] `eas.json` production profile is store distribution (`build.production.distribution: "store"`)
- [ ] Correct Apple team is configured in `eas.json` (`submit.production.ios.appleTeamId`)
- [ ] Bundle identifier matches ASC app record (`app.json` `expo.ios.bundleIdentifier`)
- [ ] Correct Apple ID is configured in `eas.json` (`submit.production.ios.ascAppId`)
- [ ] Apple ID location in ASC: **App Store Connect → My Apps → [Your App] → App Information → Apple ID**

## Identity Sanity Check

Run the script in this repo:

```bash
npm run release:identity
```

No-script equivalent:

```bash
node -e "const fs=require('fs');const app=JSON.parse(fs.readFileSync('app.json','utf8')).expo;const eas=JSON.parse(fs.readFileSync('eas.json','utf8'));console.log(JSON.stringify({slug:app.slug,bundleIdentifier:app.ios?.bundleIdentifier,scheme:app.scheme,version:app.version,buildNumber:app.ios?.buildNumber,owner:app.owner,projectId:app.extra?.eas?.projectId,ascAppId:eas.submit?.production?.ios?.ascAppId,appleTeamId:eas.submit?.production?.ios?.appleTeamId},null,2));"
```

Validate `eas.json` parsing:

```bash
node -e "JSON.parse(require('fs').readFileSync('eas.json','utf8')); console.log('eas.json valid')"
```

## Auth Redirect Sanity Check

Before building, verify the dashboard-managed auth setup still matches the app:

- Google Cloud OAuth client type: `Web application`
- Google Cloud Authorized redirect URI:
  `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase Site URL: `https://www.raulmermans.com`
- Supabase Redirect URLs:
  - `workout-tracker-ios://login-callback`
  - `workout-tracker-ios://reset-password`
- Google sign-in uses `login-callback`
- Password reset uses `reset-password`

Use [`docs/RELEASE_TESTFLIGHT.md`](../RELEASE_TESTFLIGHT.md) for the full auth
QA steps before submit.

## Build + Submit Commands

```bash
eas login
eas build --platform ios --profile production --clear-cache
eas submit --platform ios --profile production --latest --verbose
```

## Troubleshooting

| Issue                        | Likely Cause                                                                     | Fast Fix                                                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No Builds in TestFlight      | Built with internal profile or wrong distribution                                | Confirm `build.production.distribution` is `"store"`, rebuild production, and resubmit                                                                                                                                                       |
| Wrong app targeted on submit | Incorrect `ascAppId` or `appleTeamId`                                            | Check `submit.production.ios.ascAppId` and `submit.production.ios.appleTeamId`, then resubmit                                                                                                                                                |
| Processing / Invalid Binary  | Apple processing/compliance issue                                                | Open ASC TestFlight build details, resolve compliance/questions, rebuild if needed                                                                                                                                                           |
| Crash on launch              | Missing `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` in EAS env | Run `eas env:list --environment production`, confirm both names exist, rebuild production. If missing, app shows Config Error screen with missing variable names and startup logs include `[Startup] Missing Supabase environment variables` |
| Google Calendar missing      | `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` missing from the build environment          | Run `eas env:list --environment production`, confirm the variable exists, then create a new production build and install that new TestFlight version. Updating `.env` locally does not change an existing binary.                            |

## Deterministic Verification

1. Confirm release identity and config:
   - `npm run release:identity`
   - `node -e "JSON.parse(require('fs').readFileSync('eas.json','utf8')); console.log('eas.json valid')"`
2. Confirm EAS build env exists for the target profile:
   - `eas env:list --environment production`
   - Expected names: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - Also expect `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` when Google Calendar should be visible/testable in the build
3. Confirm auth redirect configuration matches the values above.
4. Build + submit with production profile:
   - `eas build --platform ios --profile production --clear-cache`
   - `eas submit --platform ios --profile production --latest --verbose`
5. In App Store Connect TestFlight:
   - Build appears under **Builds**
   - Processing completes
6. Clean-install launch check:
   - Remove old app from device
   - Install latest TestFlight build
   - Launch should reach normal app/auth flow (no immediate crash)
   - Verify Google sign-in and password reset both work on the release candidate
