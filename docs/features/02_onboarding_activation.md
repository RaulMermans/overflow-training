# Onboarding & First-Week Activation

## Status: Shipped (2026-03-16)

## What Changed

### Units preference (kg/lb)

- `src/lib/profilePreferences.ts` — Removed hardcoded `'kg'` coercion. Now reads and persists `'lb'` when stored.
- `app/(app)/onboarding.tsx` step 0 — Added SegmentedControl for kg/lb alongside the language picker. Saves immediately via `saveProfilePreferences`.

### Equipment preference step

- `src/lib/onboardingProfile.ts` — Added `Equipment` type (7 options: bodyweight, dumbbells, barbell, cables, machines, bands, kettlebell), `VALID_EQUIPMENT` array, and `equipment: Equipment[]` field to `OnboardingProfile`.
- `src/features/onboarding/flow.ts` — `ONBOARDING_STEP_COUNT` bumped from 4 to 5. New `EQUIPMENT_STEP_INDEX = 3`. `FIRST_ROUTINE_STEP_INDEX` moved from 3 to 4.
- `app/(app)/onboarding.tsx` — New equipment selection UI at step 3 using chip-toggle Pressable pattern.

### Translation keys added

- `onboarding.units.label`, `onboarding.step3.equipment.title`, `onboarding.step3.equipment.helper`
- 7 `onboarding.equipment.*` keys (bodyweight, dumbbells, barbell, cables, machines, bands, kettlebell)

## Architecture Notes

- Equipment preference is stored in SecureStore via `onboardingProfile`. Not yet used for exercise filtering — that's a future enhancement.
- Units preference persists in `profile.preferences.v2.<userId>` key.
- Onboarding step count is centralized in `src/features/onboarding/flow.ts`.
