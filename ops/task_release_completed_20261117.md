# MMS task improvements released — 17 November 2026

Antonio explicitly confirmed Roberta and Matteo were out and requested full
publication. All three prepared points were released via PR #37.

- Production: https://www.mmsgestionale.com/
- Main commit: ae5167fd91b15d0f494a58ae217f67c7c523d9e8
- Vercel production deployment: dpl_Hx4dAVdyTooWTDijKJuPJZh1EbV1, READY.
- Reviewed feature commit: 0948a516619848b3090cffd5315804dc0a20d7e6.
- Previous deployment: dpl_9dhFC2rYi1tHNm6axQdZm3SfxdoQ.

## Backup and migrations

Private RLS-enabled owner-only backups were created BEFORE the schema changes:
private.mms_task_release_20261117_backup and
private.mms_task_release_20261117_meta. They hold business-row snapshots, schema,
function definitions/ACLs, policies, grants, trigger definitions and release IDs.
No anon/authenticated/service-role table access was granted to the backups.

Both prepared additive migrations were then applied successfully on project
fzdqemzowxjuotqalaol, and PostgREST was notified to reload its schema.

Full JSON comparisons before and after migration AND after deployment confirmed
zero changed/missing legacy rows across all six backed-up tables:

| Table | Rows |
| --- | ---: |
| order_tasks | 48 |
| order_materials | 3941 |
| inventory_items | 3383 |
| inventory_shortages | 1 |
| orders | 1262 |
| payments | 1283 |

All 48 historical tasks retain quantity 1 and NULL unit_hours, without a total
rewrite. All historical material links remain NULL pending deliberate linking.
Public table grants and RLS policies, and the reservation RPC ACL, are unchanged.
New validation functions are invokers with empty search_path, not definers; their
direct execution is revoked from anon/authenticated.

## Executed checks

- 58 Python and 42 Node tests passed immediately before release.
- Both PostgreSQL/PGlite migration suites passed during preparation.
- Production READY and correct main SHA/domain aliases verified.
- Homepage and eight relevant JavaScript assets return HTTP 200 and have exact
  SHA-256 matches to the reviewed local files.
- Unauthenticated bootstrap GET, assignment PATCH and material-save POST each
  return HTTP 401. These requests contain no business data and make no writes.
- New-deployment error/fatal log scans found no matching records through
  12:25 UTC / 13:25 Europe/Rome. This is an immediate post-release check, not a
  guarantee about future requests or completed customer acceptance testing.
- No authenticated browser acceptance test or persisted production test task,
  stock reservation, payment or material row was created during deployment.

Security advisors show only INFO entries for deliberately policy-less private
backup tables. Performance advisors retain existing policy/index suggestions;
none was changed as part of this release. See the
[Supabase linter reference](https://supabase.com/docs/guides/database/database-linter).
The Vercel drains inventory endpoint returned 404, so external drain coverage
was not verified; deployment-scoped runtime-log access worked.

## Handoff

Operators may reopen the site and sign in. Close stale tabs first to avoid old
cached editors. Roberta/Matteo should accept the three flows with legitimate
new work: quantity/piece duration, article-linked material quantities, and
assignment from the new calendar queue. Existing administrator assignment
rights remain unchanged. Keep backup metadata and additive columns if a
compatibility rollback is needed after new-format records have been saved.
