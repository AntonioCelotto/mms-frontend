# Calendar-based task availability — 16 November 2026

## Scope and cause

The old warning deducted every uncompleted task dated before the deadline from
working hours counted starting today. Olga's three October tasks (8 + 5.5 + 2.5
hours) therefore consumed the entire 16–17 November capacity and falsely moved
a five-hour task to 18 November. No saved task/date/status is repaired by this
release, and no old task is deleted or automatically completed.

## Changes

- A pure, read-only browser scheduling preview mirrors `api/_task_schedule.py`.
  It honors actual requested starts, working days, daily limits, 08–13 / 14–17
  windows, real bookings across orders, article-level production dependencies,
  and stable task identities. No API requests or persistence are added.
- Current editor rows overlay saved rows once. Database order IDs are used for
  the same deterministic tie-breaking as the server's calendar engine.
- Availability now comes from calendar intervals, not a cumulative overdue
  hours subtraction. A past task spilling into the requested day still reserves
  its real hours. Earlier open tasks are shown separately for manual review.
- The warning shows expected dates/times and cannot promise availability for
  an inactive operator or an unplannable predecessor.
- The suggested completion-date button changes only the explicit deadline in
  the current draft, preserving start date/time. Delegation keeps it functional
  after warning markup is replaced. Nothing is saved automatically.
- index.html loads the preview before the capacity warning, with new versions.

## Verification

44 Python tests and 39 Node tests pass. The parity regression compares 61 task
sets between browser preview and the actual Python calendar engine, including
900 generated task combinations and impossible chains / external suppliers.
Additional capacity regressions cover the exact Olga case (17 November,
08:00–13:00, 8 hours available, 16 overdue hours reported separately), true
full days, spillovers, weekends, lunch/start times, another operator's preceding
phase, different articles, stable self identity, and immutable saved data.

```sh
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.cjs tests/test_live_sync.js
node --check app-task-schedule-preview.js
node --check app-task-deadline-capacity.js
git diff --check
```

These are executable logic/markup/parity tests, not an authenticated customer
browser end-to-end test. Native browser launch is unavailable in this executor
(socket permission was denied during the preceding release).

## Release and rollback

Base production: `630d2d37dfa40b6c10c7e22cec06706f64b13b08`.
Previous production deployment: `dpl_3Zx1TtiQrLe2ove4fA9Be9wG2N9c`.
Verify preview READY and exact source tree, merge the tested commit, confirm
production READY and both served script hashes, then check new-deployment
runtime errors. No migration, production task write, auth change, or automatic
rescheduling is included. Rollback requires only the previous code deployment.

The existing task of order 1150 / P-0869 remains on the saved date. An authorized
user can reopen it, choose 17 November and review the preview before saving.
