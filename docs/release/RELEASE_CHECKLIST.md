# Release Checklist (Prod iOS Store)

Use this checklist before shipping from `main`/`release/*`.

For public TestFlight/open beta builds, start with
[`docs/release/OPEN_BETA_CHECKLIST.md`](./OPEN_BETA_CHECKLIST.md).

## 1) Deterministic Preflight

Run:

```bash
npm run preflight:beta
```

Expected:

- `check:node-modules-integrity` passes (no `* 2` package folders).
- `check:no-duplicate-suffix-files` passes.
- `check:env:release` passes with required env vars present.
- `db:verify:contract` passes using `supabase/migrations/manifest.json`.
- `typecheck` passes.
- tests pass.
- `lint:no-new-debt` passes.
- `lint:no-hex` passes.
- `release:identity` prints expected app/EAS identifiers.

## 2) Auth Redirect Configuration

Verify dashboard-managed auth settings before shipping:

- Google Cloud OAuth client type is `Web application`
- Google Cloud Authorized redirect URI is
  `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase Site URL is `https://www.raulmermans.com`
- Supabase Redirect URLs include:
  - `workout-tracker-ios://login-callback`
  - `workout-tracker-ios://reset-password`
- Supabase Google provider stores the matching Client ID and Client Secret
- Release-candidate QA confirms Google sign-in returns through `login-callback`
  and password reset returns through `reset-password`
- New Google users can complete onboarding without creating a password

## 3) Migration Governance

- Every migration file in `supabase/migrations/` must be listed in `supabase/migrations/manifest.json`.
- `supabase/README.md` migration list must stay in the same order as the manifest.
- If you add or modify `supabase/migrations/migration-*.sql`, update `manifest.json` in the same PR.

## 4) Lint Debt Policy

- `.eslint-baseline.json` is the no-new-debt baseline.
- PRs must not introduce net-new lint debt (`npm run lint:no-new-debt`).
- Baseline updates are allowed only for dedicated lint debt updates:
  - include `lint-debt` in the PR title, or
  - set `ALLOW_ESLINT_BASELINE_UPDATE=1` in CI.

## 5) CI Gates

The `Quality Gates` workflow enforces:

- PR: governance checks, integrity checks, migration contract, no-hex, no-new-lint-debt, strict lint on touched files, typecheck, tests.
- Push to `main`/`release/*`: same gates plus `check:env:release` and `release:identity`.

## 6) Failure Triage

1. `check:node-modules-integrity` fail:
   - `rm -rf node_modules package-lock.json && npm install`
2. `check:no-duplicate-suffix-files` fail:
   - remove or rename duplicate-suffixed tracked files.
3. `db:verify:contract` fail:
   - sync `manifest.json`, `supabase/README.md`, and migration files.
4. `lint:no-new-debt` fail:
   - fix new violations, or intentionally update baseline in dedicated lint-debt PR.
5. `lint:no-hex` fail:
   - move hardcoded hex values to `src/theme/tokens.ts`.
6. `check:env:release` fail:
   - configure required EXPO_PUBLIC env vars in CI/EAS release environment.
7. Auth redirect fail:
   - correct Google Cloud, Supabase Provider, and Supabase URL Configuration
     values to the canonical setup above, then rerun release QA.

## 7) Rollback

If hardening scripts/workflows block unexpectedly:

1. Revert the hardening-only files (scripts/workflow/docs/baseline/manifest updates).
2. Keep runtime app and DB schema files unchanged.
3. Re-run preflight and CI after targeted rollback commit.
