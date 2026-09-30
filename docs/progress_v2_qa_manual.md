# Progress v2 — Manual QA Script

> Historical note: the active coaching-oriented redesign is documented in
> [`docs/progress-redesign/README.md`](docs/progress-redesign/README.md).
> Keep this file for the original Progress v2 rollout checklist.

Pre-release validation checklist for the Progress v2 screen on iOS Simulator (iPhone 15 / iOS 17+). Run this after every release candidate build.

---

## Setup

1. Start the app in Expo Go or a dev build:
   ```sh
   npm run ios
   ```
2. Sign in with a **test account** (not a personal account).
3. Ensure the test account has **at least 5 workouts** across 3 distinct weeks.
4. For offline tests, use the Network Link Conditioner or toggle Airplane Mode.

---

## QA-1: First-load (cold start, cache empty)

| #   | Step                                                               | Expected                                                                          |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1   | Kill the app and relaunch. Navigate to **Progress** tab.           | Skeleton placeholders visible within 100 ms. No blank screen.                     |
| 2   | Observe the hero metrics (workouts/week, volume, PRs, top muscle). | Cards populate within 2 s on Wi-Fi. Values are non-zero for an account with data. |
| 3   | Observe the Trends section.                                        | Two bar charts visible: Strength Volume and Workouts/week.                        |
| 4   | Note the range selector (4W · 3M · 1Y · All). Default is **3M**.   | 3M appears selected.                                                              |

---

## QA-2: Time range switching

| #   | Step              | Expected                                                             |
| --- | ----------------- | -------------------------------------------------------------------- |
| 5   | Tap **4W**.       | Skeleton flashes briefly; numbers update to reflect last 28 days.    |
| 6   | Tap **1Y**.       | Numbers reflect 365-day window. Volume should be higher than 3M.     |
| 7   | Tap **All**.      | Numbers reflect all historical data.                                 |
| 8   | Return to **3M**. | Previous values restore from cache within 200 ms (no loading state). |

---

## QA-3: Empty state (new account / no data in range)

| #   | Step                                                                              | Expected                                                          |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 9   | Sign in with a **brand-new account** (zero workouts).                             | Hero section shows "No workouts yet" card with a helpful message. |
| 10  | Trends section.                                                                   | "No volume data" and "No workout data" empty-state cards.         |
| 11  | Muscle Balance section.                                                           | "No muscle data" empty-state card.                                |
| 12  | Insights strip.                                                                   | Hidden (not rendered).                                            |
| 13  | Switch to **4W** range on account that has workouts but none in the last 28 days. | Each section independently shows its empty state.                 |

---

## QA-4: Error handling

| #   | Step                                                                    | Expected                                                                             |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 14  | Toggle **Airplane Mode** while on the Progress screen. Pull to refresh. | Each section independently shows "Could not load" with a **Retry** button. No crash. |
| 15  | Tap **Retry** on the hero section while still offline.                  | Error persists gracefully. No infinite loading state.                                |
| 16  | Re-enable Wi-Fi / cellular. Tap **Retry**.                              | Data loads successfully. Error states disappear.                                     |
| 17  | Toggle Airplane Mode on a fresh cold-start (cache empty).               | Skeletons show briefly, then error states appear. Each module has a Retry button.    |

---

## QA-5: Stale-while-revalidate / cache behaviour

| #   | Step                                                           | Expected                                                                                                          |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 18  | Navigate away from Progress tab, then return within 5 minutes. | Screen repopulates **instantly** from cache (no loading state).                                                   |
| 19  | Navigate away, wait >5 minutes (stale time), return.           | Stale data shown immediately; background refetch kicks off. Numbers update within 3 s.                            |
| 20  | Complete a workout, return to Progress.                        | Screen refreshes. New workout counts reflected within 15 s (TanStack Query invalidation fires on workout finish). |

---

## QA-6: Strength module

| #   | Step                                                       | Expected                                                                           |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 21  | Tap **Select lift** button (if no exercise picked).        | "Select a lift" prompt visible; no e1RM chart rendered.                            |
| 22  | Tap the lift picker. Search "Squat". Select it.            | Modal closes. e1RM chart renders with chronological dots.                          |
| 23  | Verify e1RM value displayed.                               | Current best displayed as `XX.X lb` (or kg) — matches the manual e1RM calculation. |
| 24  | Tap a different range.                                     | e1RM chart updates (fewer/more points).                                            |
| 25  | Pick an exercise that has only 1 data point in the period. | Chart shows a single dot. No crash.                                                |
| 26  | Pick an exercise with zero data in the period.             | "No data for [exercise name]" empty state.                                         |

---

## QA-7: Muscle Balance module

| #   | Step                               | Expected                                                                                    |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| 27  | Observe muscle bars.               | Top 6 muscles listed. Bars render proportional widths. Percentages sum to ≤100%.            |
| 28  | Verify balance insight below bars. | One insight row visible (OV or BL rule). Tone matches visual weight (warning = amber text). |
| 29  | Switch to **4W** range.            | Balance updates. If account trained only one muscle group, only one bar shows.              |

---

## QA-8: Insight strip

| #   | Step                                              | Expected                                                      |
| --- | ------------------------------------------------- | ------------------------------------------------------------- |
| 30  | Observe the insight strip below the hero metrics. | At most 2 rows: overview insight + optional strength insight. |
| 31  | Account with first-ever data logged recently.     | Shows OV-04: "You started logging — keep it going…"           |
| 32  | Account with consistency drop.                    | Shows OV-01: "Consistency down vs last period…"               |
| 33  | Account with zero data.                           | Insight strip hidden entirely.                                |

---

## QA-9: Accessibility

| #   | Step                                                           | Expected                                                                                    |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 34  | Enable **VoiceOver** (Settings > Accessibility > VoiceOver).   | All MetricCard, InsightRow, LiftPickerTrigger elements announce their `accessibilityLabel`. |
| 35  | Navigate the screen with swipe gestures.                       | No interactive elements skipped. No "unlabelled" announcements.                             |
| 36  | Enable **Large Text** (Accessibility > Larger Text > maximum). | Text does not truncate or overlap. No layout overflow.                                      |

---

## QA-10: Pull-to-refresh

| #   | Step                           | Expected                                                                    |
| --- | ------------------------------ | --------------------------------------------------------------------------- |
| 37  | Pull down on the scroll view.  | Native iOS refresh spinner appears with accent colour. All sections reload. |
| 38  | Pull to refresh while offline. | Each section shows error state after reload attempt. Spinner stops.         |

---

## QA-11: Reduced Motion

| #   | Step                                                           | Expected                                                                |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 39  | Enable Reduce Motion (Accessibility > Motion > Reduce Motion). | No animated transitions on range switch. Data updates appear instantly. |

---

## Pass / Fail criteria

- **FAIL** if: crash, blank white screen, "undefined" / "NaN" values rendered, missing Retry button, loading state never resolves, or infinite re-render observed in Metro logs.
- **WARN** (must document but doesn't block release) if: any step takes >3 s on Wi-Fi with a cold cache.
- **PASS** if: all steps ✅ with no fail conditions.
