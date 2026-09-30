# Localization & Translated Workouts

## Status: Shipped (2026-03-16)

## What Changed

### Device locale detection

- `src/lib/languagePreference.ts` — `getDeviceDefault()` now uses `expo-localization` `getLocales()` to detect the device language. Maps `es*` to Spanish, everything else falls back to English.
- `src/i18n/I18nProvider.tsx` — Initial state changed from `'es'` to `'en'` to prevent flash-of-Spanish for English users.

### Exercise name localization (client-side)

- `src/i18n/exerciseNames/en.ts` — Identity map of seed exercise slugs to English names.
- `src/i18n/exerciseNames/es.ts` — Spanish translations keyed by slug.
- `src/i18n/exerciseNames/index.ts` — `getLocalizedExerciseName(slug, language, englishName?)` with fallback chain: `lang map → en map → englishName → slug`.

### Display integration

- `src/components/ui/ExerciseSearch.tsx` — Uses `getLocalizedExerciseName` for display.
- `src/components/workout-session/ExerciseBlock.tsx` — Localized exercise names in active session.
- `src/components/workout-session/ExerciseAccordionItem.tsx` — Same pattern.
- `app/(app)/onboarding.tsx` — Localized exercise names in routine preview.

## Architecture Decisions

- **Client-side translation maps** (not DB migration). DB stores canonical English names and slugs. Search queries hit English names/aliases. Display uses localized names. Business logic uses IDs, never display strings.
- Translation maps keyed by `slug` field from `exercise_definitions`.
- New exercises: add slug→name entry to both `en.ts` and `es.ts`. Missing translations fall back to English name.

## Tests

- `__tests__/language-preference.test.ts` — 5 tests for `getDeviceDefault()`.
- `__tests__/exercise-names-i18n.test.ts` — 8 tests for `getLocalizedExerciseName`.
