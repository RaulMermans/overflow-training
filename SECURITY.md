# Security

This document summarizes the security posture of the Overflow iOS app and what is in scope for this MVP.

## Implemented

- **Secrets**: `.env` is gitignored. Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are used in the client; the anon key is safe with Row Level Security (RLS). The service-role key is never used in the app.
- **Env guardrails**: `npm run check:env` hard-fails if `SUPABASE_SERVICE_ROLE_KEY` (or `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`) is present, or if `EXPO_PUBLIC_SUPABASE_ANON_KEY` decodes to `service_role`.
- **Secret incident response**: If a service-role key is exposed (chat, logs, screenshots, shell history), rotate it immediately in Supabase Dashboard and treat the previous key as compromised.
- **Session storage**: Supabase auth tokens are stored in `expo-secure-store` (iOS Keychain) with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- **RLS**: Row-level security is enabled on every user-scoped table; data is scoped to `auth.uid()`. `exercise_definitions` is read-only for authenticated users.
- **Transport**: All API traffic uses HTTPS (iOS ATS; Supabase over TLS). No cleartext exceptions.
- **Error handling**: Raw errors are sanitized before shown to users. Sensitive logging (Supabase/auth messages) runs only in `__DEV__`.
- **Input validation**: Reps (1–999) and weight (0–9999) are bounded in the app; auth forms validate email format and password length (min 6) before calling Supabase.
- **Dependencies**: `npm audit` is run; critical and high vulnerabilities are addressed. Run `npm audit` and `npm audit fix` periodically.

## Out of scope (MVP)

- **Jailbreak detection**: Not implemented. Consider for higher-risk apps (e.g. banking).
- **Certificate pinning**: Not used; Supabase HTTPS is relied upon. Pinning adds complexity and cert-rotation risk.
- **Code obfuscation**: Not applied to the JS bundle in the current Expo managed workflow.
- **App Attestation**: Not used. Consider for APIs that must verify the client app.

## Reporting vulnerabilities

If you discover a security issue, please report it privately through GitHub's **Report a vulnerability** (Security tab → Advisories) rather than opening a public issue.
