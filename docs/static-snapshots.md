# Static catalog snapshots

Public pages, API handlers, search, and sitemap generation read only the JSON bundles in `src/data/snapshots`. They never fall back to PostgreSQL at runtime. A corrupt, missing, empty, or checksum-mismatched required bundle fails explicitly.

The production repository contains real, approved catalog snapshots (`fixture: false` in `manifest.json`), committed directly to source control. Vercel builds and serves the entire site from these static JSON files and does not require a PostgreSQL connection or database credentials at build or runtime.

## Architecture and synchronization lifecycle

1. **Upstream Database Ingestion (CircleCI)**:
   CircleCI runs automated sync workflows to ingest raw course, transfer, and program data from upstream vendor APIs into Neon PostgreSQL:
   - **Course Catalog Sync**: Sunday 03:00 UTC (`snhu-tools-course-sync`)
   - **Transfer Rules Sync**: Sunday 04:00 UTC (`snhu-tools-transfer-sync`)
   - **Program Catalog Sync**: Sunday 05:00 UTC (`snhu-tools-program-sync`)
   
   These jobs finish by approximately 06:00 UTC Sunday. **Upstream database ingestion does not automatically refresh the deployed website.**

2. **Automated Weekly Snapshot PR Workflow (GitHub Actions)**:
   Proposed schedule: **Monday ~07:00 UTC** (leaving a 25+ hour quiet window after Sunday ingestion).
   Workflow file: `.github/workflows/weekly-snapshots.yml`
   - Disabled by default. Requires explicit authorization via repository variable `ENABLE_WEEKLY_SNAPSHOT_WORKFLOW="true"` or manual `workflow_dispatch` with `confirm_execution: true`.
   - Connects using a dedicated, least-privilege, SELECT-only PostgreSQL credential (`READONLY_POSTGRES_URL`).
   - Verifies upstream database quiescence and checks that sync markers do not shift during export.
   - Generates a fresh staged export in an isolated temporary directory.
   - Executes 10 data-integrity acceptance gates (manifest schema, SHA-256 checksums, 0 rejected source rows, exact canonical program inventory preservation, 7 CBE structures, strict shrinkage checks, secret scanning).
   - If no catalog changes exist, exits cleanly without opening or updating a PR.
   - If changes exist, promotes the reviewed stage in the runner checkout, runs quality checks (`npm run check`) and production build with `POSTGRES_URL` unset, commits to branch `automation/snapshot-update`, and creates/updates a pull request targeting `main`.
   - **Never commits directly to `main`, auto-merges, or auto-deploys.**

3. **Human Review and Production Deployment (Vercel)**:
   - Engineering reviews the automated PR diff, domain counts, and Vercel preview deployment.
   - Merging the approved pull request into `main` automatically triggers a standard Vercel production deployment.
   - **Rollback Procedure**: If an issue is identified after deployment, recovery consists of reverting the snapshot pull request in Git or performing an instant deployment rollback in the Vercel dashboard to the previous production deployment.

## Required GitHub secrets and permissions

| Secret / Variable | Type | Purpose | Least-Privilege Requirement |
|---|---|---|---|
| `ENABLE_WEEKLY_SNAPSHOT_WORKFLOW` | Repository Variable | Master kill-switch | Set to `"true"` to enable recurring automation; defaults to unset/disabled |
| `READONLY_POSTGRES_URL` | Repository Secret | Read-only database export | PostgreSQL role with `CONNECT` and `SELECT` only on catalog, program, course, transfer, and sync-state tables. No `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, or `ALTER`. |
| `GITHUB_TOKEN` | Workflow Secret (Automatic) | Git branch and PR updates | `contents: write`, `pull-requests: write`. No administrative or workflow write access. |

## Export commands

All export operations require explicit source specification and never fall back to fixtures:

```sh
# Isolated local/CI fixture validation. Does not change active snapshots.
npm run snapshot:generate -- --fixture

# Package a reviewed, non-fixture four-file export without promoting it.
npm run snapshot:generate -- --from-json /absolute/path/to/approved-export \
  --approval-reference CHANGE-123

# Approved read-only database export to staging.
STATIC_EXPORT_APPROVED=true POSTGRES_URL='postgresql://readonly:…' \
  npm run snapshot:generate -- --from-postgres --approval-reference CHANGE-123

# Promote the exact directory that was staged and reviewed.
npm run snapshot:generate -- --promote-stage /absolute/path/to/.snapshot-stage-XXXX

# Automated update runner (quiescence checking + acceptance gates + diffing + promotion):
npm run snapshot:automate -- --dry-run
npm run snapshot:automate -- --stage-dir /absolute/path/to/.snapshot-stage-XXXX

# Recover safely if a directory rename was interrupted.
npm run snapshot:generate -- --recover-promotion
```

## Data-integrity acceptance gates

The automated workflow fails closed unless all ten gates pass:

1. **Manifest Schema & Provenance**: `schemaVersion === 1`, `fixture === false`, `provenance.kind === 'postgres'`, `provenance.approved === true`, non-empty `approvalReference`, valid 64-character hex source digest.
2. **Domain Checksums**: All four domain bundles (`programs.json`, `courses.json`, `transfers.json`, `search.json`) match their recorded SHA-256 digests in `manifest.json`.
3. **Reconciliation Accounting**:
   - Course records: `rejectedRows === 0`, `duplicateRows === 0`, `sourceRows === exportedRecords === ids.length`.
   - Prerequisite edges: `rejectedRows === 0`, `duplicateRows === 0`, `sourceRows === exportedEdges === edges.length`.
   - Source coverage: zero missing IDs, zero orphan class IDs, zero missing prerequisite IDs, zero self-references.
   - Cross-domain search: entries count equals sum of program directory + course summaries + transfer rows.
4. **Canonical Identifiers**: Zero duplicate program slugs, zero duplicate program PIDs, zero duplicate course IDs, zero invalid transfer course codes.
5. **Canonical Program Inventory**: Exact preservation of all 227 established canonical program source-PIDs and slugs from `src/data/canonical-program-inventory.json`. Any missing canonical slug or changed PID blocks release unless `--allow-program-deletions` is explicitly approved.
6. **Program Structures**: Every program contains valid metadata (`title`, `credential`, `catalogYear`), non-empty requirement groups (`groups.length > 0`), valid nodes and edges graph topology, and non-negative course counts.
7. **Direct Assessment CBE Programs**:
   - Preservation of all 7 CBE programs by source PID: `ryhJltQRI`, `H1pYI4BZQ`, `ryX_U4rWQ`, `rJUTINrWQ`, `HJi-S-QHee`, `r1G9UNSbm`, `SJ2tLNH-7`.
   - Exact reconciliation of 528 total credits across all 7 programs.
   - Exact preservation of 16 requirement groups.
   - Exact preservation of 312 competencies and 7 text milestones.
8. **Inventory Shrinkage Threshold**: Stricter release-specific threshold (max 1.0% drop) across courses, prerequisite edges, and transfer rows, and 0 dropped programs. Any unexpected drop blocks the workflow.
9. **Secret Scanning**: Deep recursive scanning across all staged JSON bundles, manifests, and reports for database connection strings (`postgres://`), private tokens, Neon endpoint hostnames, and private keys.
10. **Quiescence & Marker Consistency**: Sync state tables verified quiescent before export, and pre-export markers match post-export markers exactly.

## CircleCI synchronization and search indexing

CircleCI performs database migrations, upstream synchronization, result validation, and artifact retention for programs, courses, and transfers. It does **not** call `/api/revalidate` after a successful database promotion. The live website serves committed JSON snapshots, so database-only synchronization cannot refresh deployed pages or the sitemap.

The GitHub Actions weekly snapshot workflow reads Neon with a SELECT-only credential, verifies all integrity gates, and proposes a human-reviewed pull request only when there are actual changes. Merging an approved snapshot PR deploys the new static JSON and sitemap through Vercel.

The production `/sitemap.xml` is generated from committed snapshots, never by querying Neon at request time. Google can discover the published sitemap through `robots.txt` and Google Search Console. No automatic post-deployment IndexNow submission is currently wired into the snapshot PR workflow; any such notification should be a separately reviewed post-deploy integration, not a CircleCI database-ingestion side effect.

The legacy `/api/revalidate` endpoint remains available, but CircleCI no longer invokes it. Its removal is outside this cleanup's scope.
