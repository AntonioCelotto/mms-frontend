# Material/article links and calendar assignment queue — 17 November 2026

## Release status

PREPARED ONLY, together with task quantity in draft PR #37. Production code and
business data remain unchanged. Antonio will arrange operator downtime and must
confirm everyone has saved and exited BEFORE any production migration/release.
No public unauthenticated preview access is enabled and no test writes have been
made against production. The preview may share live services: do not use it for
write tests before the agreed migration window.

## Point 2 — Materials for each order article

- Each editable material row has an article selector. Article keys use the same
  id / code / article-N convention as tasks. New quote conversions retain their
  parent article in both frontend and the existing database insert trigger.
- Nullable article_key/article_name columns are additive. Existing rows are NOT
  guessed, relinked, reordered or backfilled. General/historical materials remain
  selectable as general order materials until an authorized user links them.
- API and invoker database trigger validate the key against that order's quote
  articles and derive the canonical label. Invalid cross-order links fail.
- quantity_required means the TOTAL material requirement for the row. Task piece
  quantity does not automatically multiply stock requirements or prices.
- A read-only preview shows required quantity, stock, globally free stock, the
  row's saved reservation, coverage and expected shortage. All draft rows sharing
  an inventory item compete for the same pool; only the current order's old
  reservations can be reclaimed. Other orders' commitments remain reserved.
- Actual reservations still use the original invoker replace RPC, not a second
  stock updater. Same-order replacements now lock the order; inventory locks use
  stable ID order. Repeated saves release and recompute once, atomically.
- Saves await the material result, reload stock and retain metadata on reopening.
  Inventory live-sync refreshes availability cells without unmounting the form.
- API/RPC stale-client guards reject missing article metadata for an already
  linked order instead of silently clearing the associations. Explicit unlinking
  from a refreshed editor remains possible. Decimal commas are normalized.

## Point 3 — Unassigned tasks in calendar

- A separate queue covers ALL loaded orders/dates, not just the selected week.
  It lists only saved numeric-ID tasks with neither an internal assignee nor an
  external supplier, excluding completed/cancelled tasks. IDs are deduplicated.
- Search covers order, client, article and phase. Pages contain at most 50 rows,
  avoiding huge DOMs and repeated operator selectors on large archives.
- Existing administrator assignment permissions are preserved. No operator or
  commerce account acquires new assignment rights. The API still requires admin.
- Select operator, requested start date and optional time; the existing calendar
  engine previews intervals with other orders, per-article phase dependencies,
  operator workdays and the 13:00–14:00 lunch break. Late completion needs explicit
  confirmation; an unplannable predecessor cannot be assigned by bypassing checks.
- Assignment PATCH changes ONLY assignee and requested start, not quantity,
  unit/total hours, article, task ID, status or deadline. Current data is checked
  server-side, and compare-and-set filters prevent overwriting an assignment or
  edit that another operator completed meanwhile (409 response).
- Double clicks are suppressed. Successful assignment reloads the calendar; a
  refresh error is distinguished from a save error. Conflict/error paths retain
  the form choices. Unrelated drafts and selected order stay untouched.

## Verification

Final local run: 58 Python tests and 42 Node tests passed, plus both isolated
PostgreSQL migration tests and 16 changed/new JavaScript syntax checks.

Run both full suites, syntax checks, and the two isolated SQL tests:

```sh
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.cjs tests/test_live_sync.js
MMS_PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/task_quantity_migration.mjs
MMS_PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/material_articles_migration.mjs
git diff --check
```

The new PostgreSQL/WASM test covers migration preservation, canonical labels,
same-stock rows across articles, other orders' reservations, repeat save,
shortages/decimal quantities, invalid-link transaction rollback, customer stock,
new order conversion, function privileges/invoker/RLS and assignment compare-and-
set preserving 70 hours, article and deadline. Node tests cover actual handlers,
reopening, live availability without lost drafts, all dates, external/completed
exclusion, preview scheduling across operators, minimal payloads and conflicts.
These are executable logic/SQL/DOM-handler tests, not a claim that Roberta or
Matteo has already completed authenticated browser acceptance tests.

## Combined maintenance release — NOT executed

1. Obtain Antonio's explicit all-operators-out confirmation. Verify project IDs,
   current main/deployment and exact reviewed feature commit; inspect any drift.
2. Take a fresh authorized backup of order_tasks, order_materials,
   inventory_items, inventory_shortages, relevant orders and function/schema
   definitions. Record counts and hashes of legacy business fields.
3. On Supabase project fzdqemzowxjuotqalaol, transactionally apply first quantity
   migration 20261117113529, then material-article migration 20261117115412. A
   3-second lock timeout should abort instead of blocking users. Verify legacy
   values/counts/hashes, function invoker status and unchanged table grants/RLS.
   Reload and verify PostgREST's schema cache; run security/performance advisors.
4. Only after schema verification, release the reviewed code to MMS Vercel
   production project prj_qvvSrPo6I7rKQiZVzOcfIrdppPxh. Confirm exact SHA, READY,
   domain alias and changed asset hashes. Require users to reload old pages.
5. With explicit test-data approval, verify one quantity task after reopen, two
   article/material rows sharing stock, shortage values and repeat-save counts;
   assign the unassigned task from calendar, check actual intervals and a second
   admin conflict. Verify operator restrictions and preserved unrelated drafts.
6. Remove only approved test records, confirm stock reservations return to their
   baseline, inspect runtime logs, then let the operators resume and retest.

Rollback is additive-schema-aware: preserve quantity/unit/article metadata and
reservation totals. Do not drop columns, overwrite tasks, delete historical
materials or rerun old historical repair SQL. After new-format writes, restoring
an older frontend needs a compatibility review; the guards deliberately stop old
clients from overwriting duration or article associations.
