# Phase 8 Decommission Readiness

## Technical Migration Checkpoint

- **Current Repository Checkpoint**: `56049ca092884a2b659b029f8abb7bb354ba37d9`
- **Active Production Application Commit**: `e51ea526f4f5c6df5cfbb6bb88ce233c1d20cfb0`
- **Canonical Production URL**: `https://snhu-tools.vercel.app`
- **Production Deployment ID**: `dpl_FqwVtpNm288P8qHmQeCJCSpZtBQG`
- **Technical Migration Status**: **COMPLETE**
- **Audit Mode**: **READ-ONLY** (zero infrastructure or data deletion performed)

## Current Production Health

Live verification against `https://snhu-tools.vercel.app` confirms 100% operational health across all core endpoints:
- `GET /`: 200 OK
- `GET /programs`: 200 OK
- `GET /courses`: 200 OK
- `GET /transfers`: 200 OK
- `GET /search?q=CS210`: 200 OK
- `GET /api/search?q=accounting`: 200 OK
- `GET /api/course/CS210`: 200 OK
- `GET /api/v1/transfer-coverage?courses=ACC201,CS210`: 200 OK
- `GET /sitemap.xml`: 200 OK (3,389 unique canonical URLs)
- `GET /robots.txt`: 200 OK (`Allow: /`, `Disallow: /api/`, canonical sitemap advertised)

Runtime Error Statistics (Vercel Production Logs):
- HTTP 500 errors: **0**
- Connection exhaustion / timeout errors: **0**
- PgBouncer / prepared statement errors: **0**
- Honeybadger faults: **0**

## Writer Health

- **Recurring Writer Authority**: SNHU Tools (`gh/andrewtryder/snhu-tools`) is the sole authorized writer authority.
- **Active CircleCI Schedules**: 3 active weekly schedules on branch `integration/snhu-tools`:
  1. Courses: `weekly-snhu-tools-course-catalog-sync` (Sunday 03:00 UTC)
  2. Transfers: `weekly-snhu-tools-transfer-sync` (Sunday 04:00 UTC)
  3. Programs: `weekly-snhu-tools-program-catalog-sync` (Sunday 05:00 UTC)
- **Legacy CircleCI Schedules**: **0** active schedules across all legacy projects (`snhu-courses`, `snhu-transfers`, `snhu-degreemap`).
- **Natural Scheduled Writer Cycle Status**:
  - Today is Wednesday, September 2, 2026.
  - The first scheduled natural Sunday writer cycle will execute on **Sunday, September 6, 2026**.
  - Because this natural execution cycle has not yet elapsed, it represents an active **DECOMMISSION BLOCKER**. Decommissioning of legacy rollback writers and databases cannot proceed until at least one complete natural cycle succeeds.

## SEO / Redirect Health

- Permanent HTTP 308 redirects verified active from all legacy hosts to canonical `snhu-tools.vercel.app` destinations:
  - `snhu-degreemap.vercel.app/programs/accounting-bs` -> 308 -> `https://snhu-tools.vercel.app/programs/accounting-bs`
  - `snhu-courses.vercel.app/course/CS210` -> 308 -> `https://snhu-tools.vercel.app/courses/CS210`
  - `snhu-transfers.vercel.app/courses/acc201` -> 308 -> `https://snhu-tools.vercel.app/transfers/courses/acc201`
- Single hop confirmed; query string parameters strictly preserved.
- Production sitemap contains 3,389 unique canonical URLs spanning Degree Programs (458), Courses (2,394), Transfers (524 facets/courses), and Hub pages (13).
- Search Console submission: External manual follow-up pending.

## Legacy Database Inventory

1. **DB-A (Legacy Degree Map)**:
   - Provider: Neon
   - Role in old architecture: Degree Programs data store
   - Application dependency: None (`snhu-tools` runtime connects to `snhu_tools`)
   - Writer dependency: None (`snhu-tools-program-sync` targets `snhu_tools`)
   - Current Classification: **RETIRE_LATER** (must be retained for rollback through stabilization)
2. **DB-B (Legacy Courses)**:
   - Provider: Neon
   - Role in old architecture: Course catalog data store
   - Application dependency: None
   - Writer dependency: None
   - Current Classification: **RETIRE_LATER** (retain for rollback through stabilization)
3. **Existing DB-C Database (Legacy Transfers)**:
   - Provider: Neon (same Neon project as `snhu_tools`, distinct logical database)
   - Role in old architecture: Transfer course data store
   - Application dependency: None
   - Writer dependency: None
   - Current Classification: **RETIRE_LATER** (retain for rollback through stabilization)
4. **Consolidated `snhu_tools` Database**:
   - Provider: Neon
   - Role: Active unified production database
   - Classification: **KEEP LONG TERM**

## Legacy Vercel Inventory

1. **`snhu-degreemap`**:
   - Current Deployment: `dpl_Du2ha6Xz4rpURQpaepcNAgArLj8Q` (Static HTTP 308 edge redirect)
   - Rollback Deployment: `dpl_31ZXTDUvonuFkmwk4CpG2kwCTr7S` (Retained legacy application)
   - Canonical Alias: `https://snhu-degreemap.vercel.app`
   - Classification: **KEEP PROJECT** (indefinite redirect serving) / **RETIRE_LATER** for old deployment
2. **`snhu-courses`**:
   - Current Deployment: `dpl_2GZ2QhGeatZuhWaQbVtKpHUbEWg8` (Static HTTP 308 edge redirect)
   - Rollback Deployment: `dpl_AGCXL2vxcxwHGRq1Rw8PD8mWjFNR`
   - Canonical Alias: `https://snhu-courses.vercel.app`
   - Classification: **KEEP PROJECT** / **RETIRE_LATER** for old deployment
3. **`snhu-transfers`**:
   - Current Deployment: `dpl_7Sty5XJG5qVmZWoC2s1nja6Q3hpy` (Static HTTP 308 edge redirect)
   - Rollback Deployment: `dpl_BruVJV9xmXQ9eQa578PRYQ7meyoe`
   - Canonical Alias: `https://snhu-transfers.vercel.app`
   - Classification: **KEEP PROJECT** / **RETIRE_LATER** for old deployment

## Legacy CircleCI Inventory

- `snhu-degreemap-sync-context`: Retained for rollback; 0 active schedules consume it. Classification: **RETIRE_LATER**.
- `snhu-courses-sync`: Retained for rollback; 0 active schedules consume it. Classification: **RETIRE_LATER**.
- `snhu-transfers-sync`: Retained for rollback; 0 active schedules consume it. Classification: **RETIRE_LATER**.
- New contexts (`snhu-tools-program-sync`, `snhu-tools-course-sync`, `snhu-tools-transfer-sync`): **KEEP LONG TERM**.

## Git Repository Retention

- All three legacy repositories (`~/code/snhu-degreemap`, `~/code/snhu-courses`, `~/code/snhu-transfers`) verified clean, unedited, and read-only.
- **Recommendation**: **KEEP / ARCHIVE LATER**. Do NOT delete legacy Git repositories. They preserve complete commit provenance, issue history, and architectural reference.

## Backup / Restore Requirements

Final retirement database backups (`pg_dump`) must **NOT** be taken during active stabilization or during this audit. The preferred timing for capturing offline logical dumps of DB-A, DB-B, and legacy DB-C is **after stabilization is complete, immediately before retirement operations**. This guarantees that the backup represents the true final retained state of each legacy database. Once captured, the dumps must be verified as readable and complete prior to any drop/delete execution. Neon PITR capabilities are tied to active project existence and cannot protect dropped databases.

## Resource Categorization Matrix

### Group A — Keep Long Term
- Unified Vercel Project: `snhu-tools`
- Unified Neon Database: `snhu_tools`
- Unified CircleCI Schedules: Courses (Sun 03:00), Transfers (Sun 04:00), Programs (Sun 05:00)
- Unified CircleCI Contexts: `snhu-tools-program-sync`, `snhu-tools-course-sync`, `snhu-tools-transfer-sync`
- Legacy Vercel Projects: `snhu-degreemap`, `snhu-courses`, `snhu-transfers` (required indefinitely for HTTP 308 redirects)
- Git Repositories: `snhu-tools`, `snhu-degreemap`, `snhu-courses`, `snhu-transfers`

### Group B — Retain Through Stabilization (Active Blocker)
- Legacy Databases: DB-A, DB-B, existing DB-C legacy database
- Legacy CircleCI Contexts: `snhu-degreemap-sync-context`, `snhu-courses-sync`, `snhu-transfers-sync`
- Legacy Vercel Application Deployments: `dpl_31ZXTDUvonuFkmwk4CpG2kwCTr7S`, `dpl_AGCXL2vxcxwHGRq1Rw8PD8mWjFNR`, `dpl_BruVJV9xmXQ9eQa578PRYQ7meyoe`
- Legacy Vercel Environment Variables on legacy projects

### Group C — Safe to Retire After Conditions
- Legacy CircleCI Contexts: Retirable once the first natural Sunday writer cycle completes successfully on September 6, 2026, and the 7-day stabilization period ends on September 9, 2026.
- Legacy Vercel Application Deployments: Retirable once the 7-day stabilization period ends.
- Obsolete Environment Variables on Legacy Vercel Projects: Retirable once the 7-day stabilization period ends.
- Legacy Databases (DB-A, DB-B, legacy DB-C): Retirable **LAST**, only after:
  1. Successful natural CircleCI writer cycle on September 6, 2026.
  2. Full 7-day stabilization window elapsed through September 9, 2026.
  3. Zero production errors logged in Vercel and Honeybadger.
  4. Verified offline `pg_dump` logical backups captured.

### Group D — Blocked / Unknown
- Google Search Console sitemap indexing completion (dependent on external crawler schedule).

## Recommended Retirement Order

When the stabilization conditions are satisfied, decommission actions must strictly proceed in this order:
1. **Sunday, September 6, 2026**: Observe first natural scheduled writer cycle (Courses 03:00, Transfers 04:00, Programs 05:00 UTC).
2. **Wednesday, September 9, 2026**: Confirm completion of the full 7-day stabilization period with zero critical errors.
3. Take and verify offline logical backups (`pg_dump`) of DB-A, DB-B, and legacy DB-C.
4. Delete legacy CircleCI contexts (`snhu-degreemap-sync-context`, `snhu-courses-sync`, `snhu-transfers-sync`).
5. Remove obsolete environment variables from legacy Vercel projects.
6. Dereference / retire old application deployments on legacy Vercel projects.
7. **LAST STEP**: Drop legacy databases (DB-A, DB-B, legacy DB-C) on Neon.
8. **DO NOT DELETE**: Legacy Vercel projects (`snhu-degreemap`, `snhu-courses`, `snhu-transfers`) must remain active indefinitely to serve HTTP 308 redirects.
9. **DO NOT DELETE**: Legacy Git repositories must remain archived.

## Go / No-Go Criteria

- **Current Status**: **NO-GO FOR DECOMMISSIONING AT THIS TIME**.
- **Blockers**:
  1. Natural scheduled writer cycle has not yet elapsed (scheduled for Sunday, September 6, 2026).
  2. Active 7-day stabilization period is in progress (in effect through Wednesday, September 9, 2026).
  3. Offline logical database backups have not yet been generated.
