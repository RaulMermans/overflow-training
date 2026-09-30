# Feature Memory Index

This directory stores per-feature implementation memory: what was built, key decisions, architecture choices, and future work. Load the relevant file before touching a feature area.

## Naming Convention

`NN_slug.md` — sequential number + kebab-case slug. Skip numbers are OK (reserved for future features).

## Feature Files

| #   | File                                                                                       | Status             | Summary                                                                          |
| --- | ------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------- |
| 01  | [01_localization_and_translated_workouts.md](./01_localization_and_translated_workouts.md) | Shipped 2026-03-16 | Device locale detection, client-side exercise name maps (en/es), fallback chain  |
| 02  | [02_onboarding_activation.md](./02_onboarding_activation.md)                               | Shipped 2026-03-16 | 5-step flow, kg/lb units, equipment selection (7 types), SecureStore persistence |
| 03  | [03_notifications_habit_loops.md](./03_notifications_habit_loops.md)                       | Installed, dark    | Full infra in place; activate via `ENABLE_NOTIFICATIONS = true` + EAS build      |
| 05  | [05_accessibility_native_polish.md](./05_accessibility_native_polish.md)                   | Shipped 2026-03-16 | 44pt targets, VoiceOver labels on SegmentedControl/SettingsItem/ExerciseSearch   |

## How to Use

- **Before editing a feature area** — load the relevant feature file for decisions and gotchas.
- **After shipping a feature** — update status and add any post-ship notes.
- **When starting a new feature** — create `NN_slug.md` using the template below.

## Feature File Template

```markdown
# Feature Name

**Status:** Planning | In Progress | Installed (dark) | Shipped YYYY-MM-DD
**Feature flag:** `FLAG_NAME = false` (or N/A)

## What Was Built

[1–3 bullet summary]

## Key Decisions

[Architecture choices, tradeoffs, alternatives rejected]

## Integration Points

[Files touched, hooks, DB tables, RPCs]

## Tests

[Test files + count]

## Activation

[Steps to turn on if dark-launched]

## Future Work

[Known gaps, next phases]
```

## Related
