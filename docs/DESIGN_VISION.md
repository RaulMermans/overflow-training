# Design Vision: Calm Performance Training Journal

## North Star

The product should feel like a calm performance training journal: focused, grounded, and repeatable.

## User Promises

- "Logging is frictionless."
- "Progress feels like reflection, not judgment."
- "The app has a heartbeat (Today)."

## Emotional and Functional Outcomes

### Today (heartbeat)

- Emotional: the user feels oriented immediately, not overwhelmed.
- Functional: the user can see what matters right now and take one clear next action.

### Logging flow

- Emotional: input feels steady and lightweight, never punitive.
- Functional: set entry and workout actions are obvious, reachable, and fast with large tap targets.

### Reflection and progress

- Emotional: trend awareness replaces score-chasing.
- Functional: weekly and historical signals are readable, consistent, and comparable at a glance.

## Design Contract (Do / Don't)

### Do

- Use whitespace as structure.
- Use one restrained accent color only.
- Use tabular numbers for sets, reps, weight, time, and streak metrics.
- Use subtle motion for continuity and feedback.
- Preserve iOS-native readability and touch ergonomics.

### Don't

- Don't use neon colors.
- Don't use heavy gradients.
- Don't use multiple accent colors.
- Don't use shouty, judgmental, or gamified copy.
- Don't leak implementation/dev language into user-facing text.

## Accessibility Baseline

- Minimum interactive target size: `44x44` points.
- Avoid low-contrast text on surfaces; prioritize high legibility for primary and supporting content.
- Preserve hierarchy with clear size/weight/spacing contrast before relying on color.

## Stability Clause (v1)

This document is the Stage 1 design contract and is intentionally stable.

- Scope: visual and UX direction only.
- Change policy: revise only when product intent changes, not during routine UI cleanup.
- Implementation use: all upcoming token and primitive refactors must align to this contract.
