# Accessibility & Native Polish

## Status: Shipped (2026-03-16)

## What Changed

### UI primitive accessibility

- **`src/components/ui/SegmentedControl.tsx`** — Added `accessibilityRole="radiogroup"` on container, `accessibilityLabel={option.label}` on each segment.
- **`src/components/ui/SettingsItem.tsx`** — Added `accessibilityRole="button"` and `accessibilityLabel={label}`.
- **`src/components/ui/ExerciseSearch.tsx`** — Bumped menu chip `minHeight` from 40 to 44 (Apple HIG 44pt minimum).

### Workout save confirmation

- Already implemented: `hapticSuccess()` fires in `completeRemoteFinishSuccess`, `WorkoutCompleteCelebration` modal displays on success, and queued path has `triggerGentleHaptic`. No additional changes needed.

## Accessibility Standards

- Target: Apple HIG 44pt minimum touch targets on all interactive elements.
- Pattern: Forward `accessibilityRole`, `accessibilityLabel`, and `accessibilityState` from `src/components/ui/Button.tsx` as the reference implementation.
- VoiceOver: All interactive primitives should announce their purpose and state.

## Future Work

- Systematic audit of remaining components (Card, Chip, Input).
- Automated accessibility testing in CI.
- Dynamic Type support audit.
