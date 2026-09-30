# UI Principles

## 1. Token-First Styling Policy

- Route all visual decisions through design tokens (color, spacing, typography, radii, motion, touch).
- Shared primitives are the first place to implement visual changes; avoid screen-by-screen one-offs.
- No raw hex/rgba values in screen code or shared components except documented temporary migration hotspots.

## 2. Color Model

- One accent color only across interactive emphasis.
- Surfaces are restrained and quiet to support focus.
- No neon, heavy gradients, or competing highlights.
- Semantic colors are functional and sparing (error, success, warning), not decorative.

## 3. Typography and Numeric Clarity

- Maintain clear type hierarchy for scanning: heading, body, supporting metadata.
- Use tabular numerals for performance metrics and repeated value columns.
- Prefer readability over density; avoid compressed visual rhythm.

## 4. Layout Rhythm and Touch Ergonomics

- Build structure through spacing cadence rather than borders/noise.
- Keep comfortable vertical rhythm in lists, forms, and stacked cards.
- Ensure touch targets are at least `44x44` points.
- Keep primary actions easy to reach and visually obvious.

## 5. Motion

- Motion should reduce cognitive load, not increase excitement.
- Favor short, subtle transitions for state changes and focus shifts.
- Avoid celebratory or attention-seeking motion patterns.

## 6. iOS-Native Feel

- Match iOS interaction expectations: clear affordances, predictable feedback, legible defaults.
- Preserve native reading patterns in list rows, action bars, and form controls.
- Prioritize calm clarity over visual novelty.

## 7. Migration Guardrails

- Minimize churn by updating tokens and shared primitives first.
- Keep behavior identical unless explicitly scoped otherwise.
- Do not alter backend/Supabase or data flow during UI system stages.
