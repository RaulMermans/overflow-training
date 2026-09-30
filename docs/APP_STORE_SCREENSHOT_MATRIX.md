# App Store Screenshot Matrix

Capture screenshots after final UI polish is merged. Do not include debug/dev copy or setup language.

## Devices

- iPhone 6.7" (required)
- iPhone 6.5" (required)

Use the same shot order on both sizes.

## Shot List

| #   | Screen         | State / Preconditions                                                     | Capture Notes                                                                 |
| --- | -------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Today          | Logged in, no in-progress workout, at least 1 completed workout this week | Show greeting, cadence, week rhythm, and single dominant `Start Workout` CTA. |
| 2   | Today (Resume) | Existing in-progress workout                                              | Show single dominant `Resume Workout` CTA and calm supporting copy.           |
| 3   | Active Workout | 1–2 exercises, multiple sets, chips visible                               | Show fast set-entry ergonomics, clear hierarchy, and sticky finish action.    |
| 4   | Progress       | Data available for reflection/lift/volume modules                         | Show readable trend cards and reflection status with calm tone.               |
| 5   | Calendar       | At least 2 recent completed workouts                                      | Show heatmap + recent activity rows with truthful labels.                     |
| 6   | Profile        | Logged in with settings and stats visible                                 | Show clean system-level layout and readable settings rows.                    |

## Capture Checklist (Each Shot)

- Use production-safe copy only (no internal terms, setup instructions, SQL, dashboards).
- Verify one accent strategy and tokenized visual consistency.
- Ensure text is readable and not clipped.
- Ensure tappable controls remain >= 44px visual target.
- Ensure no duplicate headers or overlapping sticky bars.
- Confirm units display is consistent (`lb`/`kg`) within each shot.

## Final Review Checklist

- [ ] Both device sizes captured with matching shot order.
- [ ] Today -> Workout -> Progress flow is visually coherent.
- [ ] No dev/prototype language appears in any screenshot.
- [ ] Screenshots match current shipped UI (not stale builds).
