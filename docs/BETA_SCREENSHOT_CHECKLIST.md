# Beta Screenshot Checklist

Execute this checklist to capture App Store screenshots per [APP_STORE_SCREENSHOT_MATRIX.md](APP_STORE_SCREENSHOT_MATRIX.md). Use KG-only units for consistency.

## Device setup

- [ ] **iPhone 6.7"** — e.g. iPhone 15 Pro Max simulator or device
- [ ] **iPhone 6.5"** — e.g. iPhone 14 Plus simulator or device

Same shot order on both sizes.

---

## Shot 1 — Today

| Step          | Action                                                              | Done |
| ------------- | ------------------------------------------------------------------- | ---- |
| Preconditions | Logged in, no in-progress workout, ≥1 completed workout this week   | [ ]  |
| Navigate      | Open Today tab                                                      | [ ]  |
| Verify        | Greeting, cadence, week rhythm, single dominant "Start Workout" CTA | [ ]  |
| Capture 6.7"  | Screenshot                                                          | [ ]  |
| Capture 6.5"  | Switch device, repeat, screenshot                                   | [ ]  |

---

## Shot 2 — Today (Resume)

| Step          | Action                                                     | Done |
| ------------- | ---------------------------------------------------------- | ---- |
| Preconditions | Create or leave one workout in progress (do not complete)  | [ ]  |
| Navigate      | Open Today tab                                             | [ ]  |
| Verify        | Single dominant "Resume Workout" CTA, calm supporting copy | [ ]  |
| Capture 6.7"  | Screenshot                                                 | [ ]  |
| Capture 6.5"  | Switch device, repeat, screenshot                          | [ ]  |

---

## Shot 3 — Active Workout

| Step          | Action                                                               | Done |
| ------------- | -------------------------------------------------------------------- | ---- |
| Preconditions | In-progress workout with 1–2 exercises, multiple sets, chips visible | [ ]  |
| Navigate      | Open workout session screen                                          | [ ]  |
| Verify        | Set-entry ergonomics, clear hierarchy, sticky finish action          | [ ]  |
| Capture 6.7"  | Screenshot                                                           | [ ]  |
| Capture 6.5"  | Switch device, repeat, screenshot                                    | [ ]  |

---

## Shot 4 — Progress

| Step          | Action                                                    | Done |
| ------------- | --------------------------------------------------------- | ---- |
| Preconditions | Account has data for reflection/lift/volume (Progress v2) | [ ]  |
| Navigate      | Open Progress tab                                         | [ ]  |
| Verify        | Readable trend cards, reflection status, calm tone        | [ ]  |
| Capture 6.7"  | Screenshot                                                | [ ]  |
| Capture 6.5"  | Switch device, repeat, screenshot                         | [ ]  |

---

## Shot 5 — Calendar

| Step          | Action                                          | Done |
| ------------- | ----------------------------------------------- | ---- |
| Preconditions | At least 2 recent completed workouts            | [ ]  |
| Navigate      | Open Calendar tab                               | [ ]  |
| Verify        | Heatmap + recent activity rows, truthful labels | [ ]  |
| Capture 6.7"  | Screenshot                                      | [ ]  |
| Capture 6.5"  | Switch device, repeat, screenshot               | [ ]  |

---

## Shot 6 — Profile

| Step          | Action                                                              | Done |
| ------------- | ------------------------------------------------------------------- | ---- |
| Preconditions | Logged in, settings and stats visible                               | [ ]  |
| Navigate      | Open Profile tab                                                    | [ ]  |
| Verify        | Clean layout, readable settings rows, Legal (Privacy/Terms) visible | [ ]  |
| Capture 6.7"  | Screenshot                                                          | [ ]  |
| Capture 6.5"  | Switch device, repeat, screenshot                                   | [ ]  |

---

## Per-shot verification (each of 12 images)

- [ ] No internal/dev/setup/SQL/dashboard copy
- [ ] One accent strategy, tokenized consistency
- [ ] Text readable, not clipped
- [ ] Tappable controls ≥ 44pt
- [ ] No duplicate headers or overlapping sticky bars
- [ ] Units consistent (KG only)

---

## Final review

- [ ] Both device sizes captured with matching shot order (1–6)
- [ ] Today → Workout → Progress flow visually coherent
- [ ] No dev/prototype language in any screenshot
- [ ] Screenshots match current shipped UI (not stale build)
