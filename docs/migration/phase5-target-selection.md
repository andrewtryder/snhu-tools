# Phase 5 Target Selection Evidence

## Scope

This was a read-only evidence pass. PostgreSQL parity sessions set and verified read-only mode before aggregate queries. Vercel/CircleCI inspection used read-only listing and production-environment pull commands only; Neon inspection used GET requests only.

## Current Production Vercel Mapping

| Legacy deployment | Mapping result | Current URL classification | Evidence limit |
| --- | --- | --- | --- |
| Programs | unknown | unknown | The linked production environment did not expose a parseable database value to this CLI session. |
| Courses | unknown | unknown | The local checkout is not linked to a Vercel project; it was not linked for this inspection. |
| Transfers | unknown | unknown | The linked production environment did not expose a parseable database value to this CLI session. |

Repository-local configuration is not treated as production-serving authority.

## Current Legacy Writer Evidence

Recent CircleCI workflows were observable and succeeded: Programs `catalog_sync_workflow`, Courses `scheduled-catalog-sync`, and Transfers `scheduled-transfer-sync`. The legacy context value behind each writer is not directly observable.

Programs has successful runs on 2026-08-23 and 2026-08-30; DB-A completed on 2026-08-23, which is strongly consistent with the earlier run. Courses has a successful 2026-08-30 scheduled run, while DB-B and DB-C Course completion timestamps are both 2026-07-28. Transfers has a successful 2026-08-30 scheduled run, while DB-C Transfers completed on 2026-07-28. Later successful writer runs may legitimately have skipped work. Therefore Course and Transfer writer-database attribution is ambiguous.

## Course Authority

### Serving Authority

Unknown. Current production serving configuration could not be mapped from the available Vercel linkage/environment evidence.

### Writer Authority

Unknown. CircleCI confirms successful legacy Course writer workflows but does not expose the context database value, and timestamps do not distinguish DB-B from DB-C.

### Data Equivalence

DB-B and DB-C have identical current Course live and staging data. Either can serve as a parity baseline; this does not establish historical serving or writer authority.

## DB-B vs DB-C Course Parity

Exact read-only counts are equal for `courses`, `courses_data`, `prerequisites`, their three staging tables, and `catalog_sync_items`: 2,589 for each inspected table. Deterministic ordered fingerprints for all six Course live/staging tables are identical.

Course state status, cursor, expected count, imported count, and lease state are equal. Completion and next-due timestamps differ, and sync IDs are not equal. Classification: **IDENTICAL CURRENT COURSE DATA**.

## Neon Pooling Capability

Neon metadata exposes `pooler_enabled` and `pooler_mode` for DB-A, DB-B, and DB-C. This confirms provider pooling capability. All three endpoint objects report `pooler_enabled: false` and `pooler_mode: transaction`; no current application URL was established as pooled.

## Candidate Endpoint Pooler State

| DB | Provider capability | Endpoint pooler enabled | Current local connection evidence |
| --- | --- | --- | --- |
| DB-A | supported | no | direct endpoint available |
| DB-B | supported | no | direct endpoint available |
| DB-C | supported | no | direct endpoint in use by the inspected Transfers configuration |

## Neon Compute Settings

All three candidates have identical inspected endpoint settings: read-write type, minimum and maximum compute of 0.25 CU, zero-second suspend timeout, transaction pooler mode, and enabled endpoint status. DB-A was idle during metadata inspection; DB-B and DB-C were active. No material compute-setting differentiator was found.

## Storage Facts

Provider-reported synthetic logical storage is approximately 41.0 MiB for DB-A, 36.7 MiB for DB-B, and 38.4 MiB for DB-C. Plan quota and provider storage headroom are unknown. The datasets remain small, but quota/headroom must be verified before a production write approval.

## Connection Capacity

Each candidate reports 112 backend PostgreSQL connections with 6 reserved, yielding 106 ordinary slots. Pooler client capacity is separate and was not reported. All current endpoints have pooling disabled. The earlier Aiven exhaustion report belongs to an earlier topology: all currently inspected domain databases are Neon, though direct Neon PostgreSQL still has finite backend capacity.

## Existing DB-C vs Fresh DB-C Database

Existing DB-C reduces bootstrap work because it contains Transfers and Course data that is parity-identical to DB-B. Its preparation would mutate a production-like Transfers dataset.

A future fresh logical database on the DB-C project is safer: it allows a clean three-domain migration/bootstrap, leaves DB-A/DB-B/DB-C intact for rollback, and gives the simplest parity comparison. It requires later creation approval and all three domain bootstraps. A fresh logical database on the same PostgreSQL service would not increase that service's connection capacity.

## Target Decision Matrix

| Option | Operational risk | Data mutation risk | Bootstrap work | Rollback simplicity | Provider characteristics | Assessment |
| --- | --- | --- | --- | --- | --- |
| Existing DB-C | lower initial work | higher: existing Transfers data changes during preparation | add Programs; Courses may be refreshed | acceptable | same Neon capacity/settings as peers; pooler disabled | viable, but less isolated |
| Fresh logical database on DB-C project | lower cutover risk | lowest: sources remain untouched | bootstrap all three | strongest | same inspected Neon characteristics pending future creation details | preferred execution shape |
| DB-A | more migration work | source Programs changes during preparation | add Courses and Transfers | acceptable | no advantage over DB-C | weaker |
| DB-B | more migration work | source Courses changes during preparation | add Programs and Transfers | acceptable | no advantage over DB-C | weaker |

## Recommendation for Human Approval

**RECOMMEND DB-C FOR HUMAN APPROVAL.** The DB-C project is the preferred consolidation host because it already contains Transfers and parity-identical Course data, while its inspected Neon capacity, compute settings, storage scale, and pooler state are not materially worse than DB-A or DB-B.

For execution, prefer a **fresh logical database on the DB-C project** after a separate creation/write approval. This preserves all three current databases unchanged through migration, bootstrap, parity validation, and rollback planning.

## Required Approval

Human approval is required to select DB-C as host, approve fresh logical database creation, approve the target connection values, and authorize the later migration/bootstrap phase.

## Remaining Pre-Cutover Checks

- Confirm Neon plan quota, storage headroom, and pooled-endpoint activation procedure.
- Confirm the intended production serving database mappings through an authorized Vercel/project owner path.
- Confirm the legacy Course/Transfer writer context mappings or explicitly supersede them during cutover.
- Confirm target backup, ownership, and approved cutover window.
- Validate pooled runtime versus direct writer endpoint behavior after target creation.
