# Canonical order archive filters — 16 November 2026

## Scope

Frontend filtering only. No API, authentication, role, database, order category,
amount, payment, photo, task, or calendar data is changed. PARTY ROOM / P-0966
is intentionally left untouched pending confirmation of its correct category.

## Cause and fix

Bootstrap returns title-cased status labels (`Da Avviare`), while the detail
editor applies sentence-case labels (`Da avviare`). The archive previously
compared those strings exactly and built distinct menu options from them.

The archive now compares canonical status keys (preferring saved `statusKey`)
and deduplicates menu options by key. Existing browser selections are normalized
when rendering. Known legacy status aliases map to their matching saved key;
unknown statuses remain distinct, never silently becoming `da_avviare`.
Payment and priority filter options also ignore casing, whitespace and the
underscore/space formatting used in server codes. Category filtering is unchanged.
An app.js version change avoids requiring browser-data deletion.

## Verification

```sh
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.cjs tests/test_live_sync.js
node --check app.js
git diff --check
```

43 Python tests and 38 Node tests pass. The new regression reproduces mixed
labels for P-0976 and other example orders, old browser selections, label
changes after saving, and composition with category/search/date/payment/priority
filters. It verifies no order data is mutated and no duplicate options render.

A native Chromium launch was attempted but the executor denied the browser's
required socket operation. No attempt was made to bypass that restriction.
Therefore these are executable logic/markup tests, not an authenticated customer
browser end-to-end test. Customer confirmation after reload remains necessary.

## Release

Base production commit: `f902b5cfb5015af922d29aec10afaf12b2ae103a`.
Previous production deployment: `dpl_EouRnG7Vubp2wykdeBwQ2ZFeVfhg`.
Verify the preview build, merge the exact tested commit, then verify production
READY, the canonical-filter script version and public script contents. Scan
new-deployment runtime errors. Rollback only needs the previous deployment;
there is no database migration or business-data repair to reverse.
