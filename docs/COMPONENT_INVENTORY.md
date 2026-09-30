# Component Inventory: Current -> Target

Last audited: 2026-03-07

## Purpose

Map the current UI surface to the target calm performance design system while minimizing churn.

## Token Compliance Legend

- Full: rendered through tokenized primitives or tokenized theme values only.
- Partial: uses tokens, but relies on local `StyleSheet`/inline styling patterns that bypass shared primitives.
- Low: uses hardcoded literals or parallel styling APIs that conflict with target system direction.

## Inventory

| Current                 |               Used Now | Token Compliance | Target                                                | Migration Note                                                                                            |
| ----------------------- | ---------------------: | ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Box`                   |                    Yes | Full             | Keep (`Box`)                                          | Foundation layout primitive; primary styling entrypoint.                                                  |
| `Text`                  |                    Yes | Full             | Keep (`Text`)                                         | Canonical text primitive with variants; route all text through it.                                        |
| `Pressable`             |                    Yes | Full             | Keep (`Pressable`)                                    | Canonical interactive wrapper with token-aware style props.                                               |
| `Screen`                |                    Yes | Full             | Keep (`Screen`)                                       | Canonical screen scaffold for safe area + spacing rhythm.                                                 |
| `Card`                  |                    Yes | Full             | Keep (`Card`)                                         | Shared container surface; evolve via tokens not screen overrides.                                         |
| `Button`                |                    Yes | Full             | Keep (`Button`)                                       | Canonical action primitive; keep one accent emphasis path.                                                |
| `ListRow`               |                    Yes | Full             | Keep (`ListRow`)                                      | Canonical row pattern for profile/history/metadata lists.                                                 |
| `SectionHeader`         |                    Yes | Full             | Keep (`SectionHeader`)                                | Keep as shared section title primitive.                                                                   |
| `EmptyState`            |                    Yes | Full             | Keep (`EmptyState`)                                   | Update copy tone through UX copy voice rules only.                                                        |
| `LoadingState`          |                    Yes | Full             | Keep (`LoadingState`)                                 | Maintain calm progress messaging style.                                                                   |
| `ErrorState`            |                    Yes | Full             | Keep (`ErrorState`)                                   | Keep simple recovery patterns (retry/reload).                                                             |
| `BottomActionBar`       |                    Yes | Full             | Keep (`BottomActionBar`)                              | Maintain large touch targets and clear primary action.                                                    |
| `StickyActionBar`       |                    Yes | Full             | Keep (`StickyActionBar`)                              | Same as above; no behavior changes.                                                                       |
| `FilterPill`            |                    Yes | Partial          | Keep -> normalize with `Pressable` + `Text`           | Uses token values, but should align to one shared stateful control pattern.                               |
| `SegmentedControl`      |                    Yes | Partial          | Keep -> normalize with tokens                         | Keep behavior; align spacing/type states to tokenized pattern.                                            |
| `SetRow`                |                    Yes | Partial          | Keep -> compose from primitives                       | Spinner uses `theme.colors.error`; keep converging on primitives.                                         |
| `AddSetForm`            |                    Yes | Partial          | Keep -> compose from primitives                       | Move `TextInput` shell styling to shared tokenized input primitive.                                       |
| `ExerciseAccordionItem` |                    Yes | Partial          | Keep -> compose from primitives                       | Same input-shell consolidation; keep interaction logic unchanged.                                         |
| `SessionHeader`         |                    Yes | Full             | Keep (`SessionHeader`)                                | Already aligned to primitive/token path.                                                                  |
| `ThemedText`            |       Limited (legacy) | Low              | Replace with `Text`                                   | Explicit deprecation: `ThemedText -> Text`.                                                               |
| `ThemedButton`          |            No (legacy) | Low              | Replace with `Button`                                 | Explicit deprecation: `ThemedButton -> Button`.                                                           |
| `StatCard`              |            No (legacy) | Low              | Replace with `Card` + `Text`                          | Remove parallel themed API dependency.                                                                    |
| `WeekView`              |            No (legacy) | Low              | Replace with tokenized `Card`/`Pressable` composition | Theme tokens; locale uses i18n + `undefined` fallback (no hardcoded en-US). Legacy View/Text composition. |
| `Badge`                 | Limited (legacy chain) | Low              | Replace with tokenized `Box` + `Text` variant         | Remove `ThemedText` dependency.                                                                           |
| `Avatar`                |                     No | Partial          | Keep -> align to tokenized primitives                 | Convert to shared primitive composition if revived.                                                       |
| `SettingsItem`          |                     No | Partial          | Replace with `ListRow` variant                        | Collapse duplicate row pattern.                                                                           |
| `SettingsSection`       |                     No | Partial          | Replace with `SectionHeader` + `Card`                 | Collapse duplicate section pattern.                                                                       |
| `StreakGrid`            |                     No | Partial          | Replace with unified heatmap primitive                | Consolidate with calendar heatmap treatment.                                                              |
| `ProgressBar`           |                     No | Partial          | Keep only if needed via tokenized primitive           | Preserve restrained accent usage.                                                                         |
| `MiniChart`             |                     No | Partial          | Keep only if needed via chart token adapter           | Enforce single accent policy in chart config.                                                             |
| `ExerciseSearch`        |                     No | Partial          | Keep -> rebuild on canonical primitives               | Remove outdated DB context coupling before reuse.                                                         |

## Explicit Deprecation Mapping

- `ThemedText` -> `Text`
- `ThemedButton` -> `Button`
- `StatCard` -> `Card` + `Text`
- `SettingsItem` -> `ListRow`
- `SettingsSection` -> `SectionHeader` + `Card`
- `WeekView` -> tokenized weekly status composition from canonical primitives

## Hotspots (Literal / Multi-Accent Drift)

- `src/components/ui/WeekView.tsx`: legacy `View`/`Text` + `StyleSheet` composition; locale fix applied — weekdays follow i18n language (no hardcoded en-US).
- `app/(app)/(tabs)/progress.tsx`: placeholder uses tokenized `Screen`/`Box`/`Text`; no raw hex.
- `src/theme/tokens.ts`: multiple accent channels defined (`primary`, `secondary`, `tertiary`); interactive emphasis uses primary only.
- `src/theme/components.ts`: parallel style helper API risks drift from canonical primitive/theming path.

## Target State Summary

- Canonical primitives: `Box`, `Text`, `Pressable`, `Screen`, `Card`, `Button`, `ListRow`, `SectionHeader`.
- One accent emphasis path across buttons, links, and charts.
- Shared input shell primitive to eliminate duplicated `TextInput` style blocks.
- Legacy themed wrappers and duplicate settings primitives removed after migration.
