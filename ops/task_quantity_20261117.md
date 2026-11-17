# Task quantity preparation — 17 November 2026

## Status and release gate

PREPARED ONLY. Do not merge or migrate production until Antonio confirms all
operators have saved their work and exited. Base production commit:
`47c32a3af50fbabcc60c544240d6ada00ad942be`.

This document covers point 1. Points 2 and 3 have since been prepared on the same
draft branch; read `ops/material_articles_unassigned_20261117.md` for the combined
release gate, second migration and additional tests. Nothing is live yet.

## Invariants

- An order task has integer quantity (default 1), hours per piece and a computed
  total. Ten pieces at seven hours create one task consuming 70 hours, not ten
  tasks. Quantity affects duration only, not order prices or material stock.
- Existing calendar/report interfaces continue using total `estimated_hours`
  / `task.hours`. Units survive detail/bootstrap reload and draft roundtrips.
- Historical rows retain their exact total: migration adds quantity 1 and NULL
  unit hours, without rewriting dates, statuses, assignments or totals. The
  editor uses that exact historical total as the one-piece duration on edit.
- Both API entry points calculate totals server-side. A database trigger also
  protects direct REST writes. Invalid quantities/hours fail before any draft
  save. The trigger rejects stale total-only changes to quantity-aware tasks;
  old clients must refresh and edit quantity and hours per piece instead.
- Task IDs, idempotency keys, access control and row-level policies are not
  changed. No production business data has been written during preparation.

## Executed verification

50 Python tests and 40 Node test files pass, including existing scheduling,
identity, payment and filter regressions. Added assertions cover 10 × 7 = 70,
repeated saves, one creation after concurrent clicks, exact legacy precision,
metadata reload, intercepted capture events, rejected pre-save validation,
API authorization and trusted totals, zero/invalid values, and distributing
70 hours across nine working days with the 13:00–14:00 lunch break.

The migration was executed against an isolated in-memory PostgreSQL instance
(PGlite), not Supabase production. Historical values, trigger calculations,
edits, stale-client rejection, invalid values, zero and invoker security pass.
No authenticated customer-browser end-to-end test has been executed.

```sh
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.cjs tests/test_live_sync.js
MMS_PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/task_quantity_migration.mjs
git diff --check
```

## Controlled release checklist — NOT executed

1. Obtain all-operators-out confirmation. Recheck current production commit.
2. Take a fresh authorized backup of order_tasks and its schema; record row
   counts and IDs/totals/date/status/assignment hashes for later comparison.
3. Apply migration `20261117113529_task_quantity_unit_hours.sql` transactionally
   to the verified Supabase project `fzdqemzowxjuotqalaol`. The 3-second lock
   timeout must fail the migration rather than block working users. Verify
   historical totals and rows are identical, quantity 1 and unit_hours NULL.
4. Reload/verify PostgREST schema cache. Only then release the reviewed code to
   the verified MMS Vercel production project; confirm exact commit and READY.
5. Reload signed-in browsers. With approval, create a clearly labelled test
   task: quantity 10, seven hours/piece; confirm one row, total 70 after reopen,
   assignments and calendar intervals. Change quantity, reopen again and verify.
   Also verify a legacy task without changing it and inspect runtime logs.
6. Remove only the explicitly approved test row, then let operators resume.

## Rollback

Before any quantity-aware task is saved, previous code can be restored while
leaving the additive columns and protective trigger in place. Do not drop the
columns automatically. Once new quantity-aware writes exist, preserve their
quantity/unit/total metadata: old code cannot safely edit their total duration
without reviewing a compatibility plan. No destructive database rollback or
automatic conversion is included.
