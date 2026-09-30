# Release Polish Notes — 2026-03-22

## Changed

- Branding: confirmed audited user-facing naming already centers `Overflow`; this pass kept that naming consistent in auth, the Google Calendar summary copy, and the Profile badge.
- Layout resilience: Profile no longer forces uppercase section headings or goal pills; shared list rows and segmented controls allow more wrapping; Progress metric rows, stat pills, wins header, inline CTA, and body-region rows now hold Spanish and larger text more safely.
- Copy: auth labels were normalized to sentence case, Google Calendar unavailable-state wording now points users toward updating the app, and Progress labels were shortened where tighter copy improves readability.
- Docs: Google Calendar docs now describe the current missing-config behavior, and this note reflects the actual polish areas touched in code.

## Manual QA Still Needed

- Verify login, signup, forgot-password, reset-password, Profile, and Google Calendar screens in English and Spanish.
- Verify larger accessibility text on Progress `Overview`, `Strength`, and `Body`, plus Profile list rows and segmented controls.
- Verify the Google Calendar unavailable copy in a build without `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`.
