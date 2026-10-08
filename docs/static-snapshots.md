# Static catalog snapshots

Public pages, API handlers, search, and sitemap generation read only the JSON bundles in `src/data/snapshots`. They never fall back to PostgreSQL. A corrupt, missing, empty, or checksum-mismatched required bundle fails explicitly.

The checked-in snapshot is a fixture, marked `fixture: true` in its manifest. It proves the architecture only and is not production-catalog validation.

## Export commands

The source is always explicit; the command never falls back to fixtures.

```sh
# Isolated local/CI fixture validation. Does not change active snapshots.
npm run snapshot:generate -- --fixture

# Package a reviewed, non-fixture four-file export. Does not promote it.
npm run snapshot:generate -- --from-json /absolute/path/to/approved-export

# Approved read-only database export. This must be run only after explicit approval.
STATIC_EXPORT_APPROVED=true POSTGRES_URL='postgresql://readonly:…' \
  npm run snapshot:generate -- --from-postgres

# Explicitly promote a fully staged snapshot after review.
STATIC_EXPORT_APPROVED=true POSTGRES_URL='postgresql://readonly:…' \
  npm run snapshot:generate -- --from-postgres --promote
```

`--from-postgres` requires a PostgreSQL role with `CONNECT` plus `SELECT` on the catalog, program, course, transfer, prerequisite, and sync-state tables; it performs only `REPEATABLE READ READ ONLY` transactions. The exporter uses a single connection and closes its pool on every outcome.

## Staging, review, and rollback

Each run writes the four domain JSON files, `manifest.json`, and `report.json` into a newly created sibling staging directory. It validates schemas, relationships, course graph materialization, search-source consistency, meaningful counts, secret-like keys, count reductions against an approved non-fixture baseline, and SHA-256 checksums; then it reloads and validates the staged files again.

The report contains fixture provenance, baseline status, per-domain counts, raw sizes, and warnings. Missing or fixture-only baselines are explicitly reported and are never treated as approved production baselines.

Promotion is opt-in. It renames the active directory to a timestamped sibling backup before swapping in the fully validated staged directory. If the swap fails, it restores the active directory; prior versions remain as rollback targets. A failed extraction or validation never writes the active directory.

For a weekly refresh, run an approved export during a catalog synchronization-safe window. PostgreSQL mode captures catalog/program/transfer update markers before and after the three domain exports and blocks release if any marker changes, because separate read-only transactions alone do not provide a cross-domain snapshot. Review `report.json`, inspect the staged diff, then rerun with `--promote` only after approval.

For the first real export, obtain explicit production approval, create a least-privilege read-only credential, choose a quiet synchronization window, run without `--promote`, review the non-fixture manifest/report and snapshot sizes, validate a build with `POSTGRES_URL` unset against the staged data, then promote and commit the resulting reviewed files in a separate approved change.

No database credentials belong in a snapshot. Generation failure writes no deployment bundle, so the prior deployed version remains the last good snapshot.
