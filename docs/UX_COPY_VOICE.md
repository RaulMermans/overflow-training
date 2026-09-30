# UX Copy Voice

## Voice Attributes

- Calm: neutral tone, low-friction language, no hype.
- Precise: concrete and brief; avoid vague motivational filler.
- Non-judgmental: describe state without blaming or scoring the user.
- Action-light: suggest the next step without pressure.

## Global Rules

- Prefer sentence case.
- Keep labels and helper text short and plain.
- Avoid exclamation-heavy or competitive framing.
- Never expose internal/dev terms in user-facing copy.

## State-Specific Rules

### Empty states

- Explain what is missing.
- Offer one clear next action.
- Keep tone invitational, not urgent.

### Error states

- State what failed in plain language.
- Offer a simple recovery action (Retry, Try again, Reload).
- Avoid technical jargon unless it helps immediate recovery.

### Success states

- Confirm completion briefly.
- Avoid celebratory or gamified language.

### Loading states

- Use plain progress language (Loading, Saving, Computing).
- Prefer specific nouns when useful (profile, progress, workout history).

## Do / Don't Examples

- Do: "No workouts yet. Start a session when you're ready."
- Don't: "Let's crush it! Start your first beast mode workout now!"
- Do: "Couldn't load progress. Try again."
- Don't: "Fatal exception while fetching analytics payload."
- Do: "Set saved."
- Don't: "Massive win unlocked!"

## Current Copy -> Target Voice Rewrites

| Current                                                      | Target                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| "No workouts yet"                                            | "No workouts logged yet."                              |
| "Start your first session to build your history and streak." | "Start a session to begin your training history."      |
| "No progress data yet"                                       | "No progress to review yet."                           |
| "Complete workouts to unlock trend charts and PR insights."  | "Complete workouts to view trends and personal bests." |
| "Computing progress"                                         | "Loading progress"                                     |
| "Loading workout history"                                    | "Loading workout history" (keep)                       |
| "View History"                                               | "View history"                                         |
| "Try Again"                                                  | "Try again"                                            |

## Copy Review Checklist

- Is this phrasing calm and neutral?
- Is the message understandable in one read?
- Is there exactly one next action when needed?
- Would this still feel respectful on a difficult training day?

## Release Copy Lint

Forbidden in user-facing UI copy:

- `seed`, `seed SQL`, `SQL Editor`
- `dashboard`, `Supabase Dashboard`
- `admin`, `internal`, `debug`
- `placeholder`, `dummy`, `test data`
