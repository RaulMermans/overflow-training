# Accessibility Checklist (Open Beta)

Quick verification for 44pt touch targets and screen reader support.

## Touch Targets (≥ 44pt)

| Component          | Status         |
| ------------------ | -------------- |
| `Button`           | minHeight={44} |
| `ListRow`          | minHeight={44} |
| `EmptyState` CTA   | Uses Button    |
| `ErrorState` retry | Uses Button    |

## Screen Reader (accessibilityLabel)

- `Button`: defaults to `title` when `accessibilityLabel` not provided
- `ListRow`: defaults to label/title when `accessibilityLabel` not provided
- Key flows (Today start, Calendar schedule, Profile actions): use Button/ListRow with visible text

## Contrast

- ErrorState, EmptyState, primary buttons: use theme tokens (textPrimary, textMuted, accent)
- Verify light mode text/background ratios on: ErrorState, EmptyState, Profile
