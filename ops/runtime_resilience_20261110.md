# Runtime reliability — 10 November 2026

Scope: application code only. No database migration, production data repair,
account permission change, public Storage access, or automatic write retries.

## Changes

- The authenticated fetch adapter retries GET bootstrap/inventory/list-attachments
  once after network failures or HTTP 502/503/504, with 350–700ms jitter. Concurrent
  identical reads share an in-flight response, scoped by URL and bearer token.
  Independent AbortSignals are not combined. Successful responses are not cached.
  POST/PATCH/DELETE, 401/403, and other endpoints are never replayed.
- Auth-profile returns 401 for an invalid/expired user token, 403 for an inactive
  application account, and 503 for a dependency outage. Unexpected exceptions
  remain 500. Internal exception details are not returned to clients.
- Dependency failures record operation stage, path (no query string), HTTP status
  or exception class, and elapsed time. No tokens, user emails, payloads, or raw
  exception messages are logged by this new diagnostic code.
- Calendar and account-workspace fetch the full `/api/accounts` list only after
  a verified admin profile is published. Other roles use the already-authorized
  bootstrap roster. Server-side account authorization is unchanged. The bootstrap
  roster retains `is_active` so disabled accounts are not shown as active.
- Operator photos use the common protected gallery renewal/open/download path,
  including expiry checks, timer/visibility renewal, one image-error recovery,
  original-order identity, and a panel-scoped DOM update. Renewal never redraws
  the order form or changes unsaved fields. Trashed photos remain hidden.
- Script version query strings are updated so reloading obtains the corrected
  scripts without deleting browser data.

## Verification

Run from the repository root:

```sh
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.cjs tests/test_live_sync.js
```

The regression suite covers task identity/capacity, calendar intervals/totals,
payment identity/concurrent saves, archive filters, inventory costs, private photo
authorization, recoverable removal, read retries, expired authentication,
redacted diagnostics, and operator photo renewal.

The optional Playwright browser test cannot run in the current executor because
its Chromium executable is missing; it is not counted as a passed browser test.
No real operator credentials are used or requested. Authenticated production
workflows still need confirmation by the customer after release.

## Release and rollback

Base: production/main `5383caeb8849818877d2a5ee31650e7e0dcc8b40`.
Validate branch preview before merging. Confirm production deployment READY,
exact commit, updated public script contents, and unauthenticated/invalid-token
API denial after release. No production business records are created by probes.
Rollback can restore the previous production deployment; no database rollback
is necessary. Monitoring remains in place. These changes improve recovery and
diagnosis; they cannot guarantee that external-service 503s never recur.
