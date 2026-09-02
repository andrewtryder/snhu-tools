# Phase 7 Production Cutover Plan

## Current Verified State

- **Consolidated Database**: `snhu_tools` on approved DB-C Neon project containing complete datasets for Programs, Courses, and Transfers.
- **Runtime Pool Consolidation**: Unified runtime pool implemented in application code (`src/lib/db/pool.ts`, `src/lib/db/runtimeMode.ts`) with `max: 1`, `idleTimeoutMillis: 5_000`, and hardened `connectionTimeoutMillis: 15_000`.
- **Preview Validation**:
  - Direct connection Preview: Passed.
  - PgBouncer pooled connection Preview: Passed.
  - Hardened cold-wake Preview (`dpl_FpDts47H9cBKNmShaFurmE4Y5e3T`): Passed two consecutive natural scale-to-zero compute wake cycles with 0 connection-establishment timeout errors (`/api/search` in 6.26s, `/api/courses/search` in 14.60s, 25/25 sequential requests HTTP/2 200 OK).
- **Production Status**:
  - `snhu-tools` Vercel project exists (`prj_bW4wbW0vRAk81AeFOkONmWuv2Gui`), Framework = Next.js, 0 Production database environment variables configured.
  - Legacy Vercel projects (`snhu-degreemap`, `snhu-courses`, `snhu-transfers`) remain active and untouched.
  - Remote CircleCI writers remain on legacy schedules pointing to legacy databases.

## Cutover Preconditions

1. Working tree on `integration/snhu-tools` clean at reviewed commit SHA.
2. Direct and pooled Neon connection URIs for `snhu_tools` verified and available.
3. Production `REVALIDATE_SECRET` matching between Vercel and CircleCI contexts.
4. Honeybadger API keys available for production observability parity.
5. No active write lease currently held on legacy databases.

## Git / Source Commit Strategy

- **Default Remote Branch**: `origin/integration/snhu-tools` (HEAD of `andrewtryder/snhu-tools`).
- **Production Source Commit**: Current reviewed HEAD commit on `integration/snhu-tools`.
- **Recommendation**: Deploy directly from `integration/snhu-tools` via Vercel CLI during Phase 7. Defer merging to `main` or connecting automatic GitHub deployments until post-stabilization.

## Vercel Production Configuration

Configure the following environment variables on the `snhu-tools` Vercel project targeting the **Production** environment:

| Variable Name | Type | Scope / Purpose | Required / Optional |
| :--- | :--- | :--- | :--- |
| `SNHU_TOOLS_DATABASE_MODE` | Config / Encrypted | `unified` (activates single shared pool across all domains) | **REQUIRED_PRODUCTION_RUNTIME** |
| `POSTGRES_URL` | Secret / Sensitive | Neon PgBouncer POOLED connection for `snhu_tools` | **REQUIRED_PRODUCTION_RUNTIME** |
| `REVALIDATE_SECRET` | Secret / Sensitive | Secret token for on-demand ISR cache invalidation (`/api/revalidate`) | **REQUIRED_PRODUCTION_RUNTIME** |
| `NEXT_PUBLIC_SITE_URL` | Config / Sensitive | `https://snhu-tools.vercel.app` (canonical origin) | **RECOMMENDED** |
| `HONEYBADGER_API_KEY` | Secret / Sensitive | Server-side runtime error tracking | **RECOMMENDED** |
| `NEXT_PUBLIC_HONEYBADGER_API_KEY` | Config / Encrypted | Client-side error tracking | **RECOMMENDED** |

*(Note: Never configure `COURSES_POSTGRES_URL` or `TRANSFERS_POSTGRES_URL` in Production; unified mode routes all queries through `POSTGRES_URL`.)*

## Vercel Production Deployment

Deploy the reviewed code to Production using the Vercel CLI:
```bash
npx vercel deploy --prod --yes
```

**Validation Before Traffic**:
- Verify deployment target is `production`.
- Verify source commit matches reviewed cutover SHA.
- Verify status is `● Ready`.
- Verify canonical alias `snhu-tools.vercel.app` routes to the new deployment.

## Production Smoke Tests

Issue authenticated/public HTTP requests to `https://snhu-tools.vercel.app`:

1. **Root & Info**:
   - `GET /` -> HTTP 200
   - `GET /about` -> HTTP 200
2. **Programs Domain**:
   - `GET /programs` -> HTTP 200
   - `GET /programs/accounting-bs` -> HTTP 200
   - `GET /programs/accounting-bs/requirements` -> HTTP 200
   - `GET /api/search?q=accounting` -> HTTP 200
3. **Courses Domain**:
   - `GET /courses` -> HTTP 200
   - `GET /courses/CS210` -> HTTP 200
   - `GET /api/courses/search?q=ACC` -> HTTP 200
   - `GET /api/course/CS210` -> HTTP 200
   - `GET /api/course-tree/CS210` -> HTTP 200
   - `GET /api/course-trees/CS210,CS330` -> HTTP 200
4. **Transfers Domain**:
   - `GET /transfers` -> HTTP 200
   - `GET /transfers/browse` -> HTTP 200
   - `GET /transfers/courses/acc201` -> HTTP 200
   - `GET /transfers/subjects` -> HTTP 200
   - `GET /transfers/organizations` -> HTTP 200
   - `GET /transfers/levels` -> HTTP 200
5. **Cross-Domain & APIs**:
   - `GET /api/v1/transfer-coverage?courses=ACC201,CS210` -> HTTP 200
   - Verify `/programs/accounting-bs` links to `/transfers/courses/...`
   - Verify `/transfers/courses/cs210` links to `/courses/CS210`

## Production Runtime Observability

Review Vercel logs and Honeybadger error stream during the first 60 minutes:
- `Connection terminated due to connection timeout`: Must be 0.
- `Connection terminated unexpectedly`: Must be 0.
- `too many connections` / `remaining connection slots`: Must be 0.
- `prepared statement` errors: Must be 0.
- Point-in-time PostgreSQL backend connections to `snhu_tools`: Must remain low (1-3 processes).

## CircleCI Context Creation

Follow project `gh/andrewtryder/snhu-tools` in CircleCI, then create three new organization contexts:

1. **`snhu-tools-program-sync`**:
   - `POSTGRES_URL`: Neon **DIRECT** (unpooled) connection to `snhu_tools`
   - `SITE_URL`: `https://snhu-tools.vercel.app`
   - `REVALIDATE_SECRET`: Secret token matching Vercel Production
   - `KUALI_CATALOG_YEAR_LABEL`: (matching legacy context, e.g. `2026-2027`)
   - `HONEYBADGER_API_KEY`: (optional, for writer error notifications)

2. **`snhu-tools-course-sync`**:
   - `POSTGRES_URL`: Neon **DIRECT** (unpooled) connection to `snhu_tools`
   - `SITE_URL`: `https://snhu-tools.vercel.app`
   - `REVALIDATE_SECRET`: Secret token matching Vercel Production
   - `HONEYBADGER_API_KEY`: (optional)

3. **`snhu-tools-transfer-sync`**:
   - `POSTGRES_URL`: Neon **DIRECT** (unpooled) connection to `snhu_tools`
   - `SITE_URL`: `https://snhu-tools.vercel.app`
   - `REVALIDATE_SECRET`: Secret token matching Vercel Production
   - `HONEYBADGER_API_KEY`: (optional)

## Manual Writer Validation

Trigger each workflow individually via CircleCI API before enabling recurring schedules:

1. **Trigger Program Sync**:
   - Parameter: `run_program_sync=true`
   - Verify: `sync-program-catalog` completes with action `promoted` or `skipped` (not due).
   - Verify: `/api/revalidate?scope=programs` called and succeeds if promoted.
2. **Trigger Course Sync**:
   - Parameter: `run_course_sync=true`
   - Verify: `sync-course-catalog` completes with action `promoted` or `skipped`.
   - Verify: `/api/revalidate?scope=courses` called and succeeds if promoted.
3. **Trigger Transfer Sync**:
   - Parameter: `run_transfer_sync=true`
   - Verify: `sync-transfer-data` completes with action `promoted` or `skipped`.
   - Verify: `/api/revalidate?scope=transfers` called and succeeds if promoted.

## Legacy Schedule Inventory

Existing active legacy schedules (audited via CircleCI API):

| Project | Schedule Name | Schedule ID | Day | Time (UTC) | Parameter |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `snhu-courses` | `weekly-snhu-course-catalog-sync` | `baa8574f-3f0d-46b0-be55-53ae3d6279c9` | Sunday | 03:00 UTC | `branch: master` |
| `snhu-transfers` | `weekly-snhu-transfer-sync` | `9541ae9d-82cf-4209-afb2-23a5cd70ea5b` | Sunday | 04:00 UTC | `run_transfer_sync: true` |
| `snhu-degreemap` | `weekly-snhu-degree-catalog-sync` | `fa9230fe-13ce-4ecb-ae32-1ed8cd49b4e2` | Sunday | 05:00 UTC | `run_program_sync: true` |

## New Schedule Plan

Recreate the non-overlapping staggered schedules on `gh/andrewtryder/snhu-tools`:

| Pipeline Parameter | Target Job | Frequency | Time (UTC) | Description |
| :--- | :--- | :--- | :--- | :--- |
| `run_course_sync: true` | `sync-course-catalog` | Every Sunday | 03:00 UTC | Weekly course catalog sync |
| `run_transfer_sync: true` | `sync-transfer-data` | Every Sunday | 04:00 UTC | Weekly transfer equivalency sync |
| `run_program_sync: true` | `sync-program-catalog` | Every Sunday | 05:00 UTC | Weekly degree program sync |

## Writer Cutover Sequence

To prevent dual authoritative writers:
1. Complete manual writer validation on all 3 domains.
2. Disable legacy schedules on `snhu-courses`, `snhu-transfers`, and `snhu-degreemap` via CircleCI API or web UI (do NOT delete them).
3. Create the 3 scheduled triggers on `snhu-tools`.
4. Verify that legacy schedules report status `disabled`.

## SEO / Indexing Sequence

1. **Launch Phase**: Deploy Production with existing temporary `noindex` headers preserved on Courses and Transfers routes during the 48-hour stabilization window.
2. **Post-Stabilization**:
   - Remove temporary `noindex` headers from Course and Transfer layouts.
   - Update `sitemap.ts` to include full course and transfer URLs.
   - Deploy code update to Production.
   - Submit `https://snhu-tools.vercel.app/sitemap.xml` to Google Search Console.

## Legacy Redirect Sequence

After `snhu-tools.vercel.app` is validated and healthy in production, deploy HTTP 308 permanent redirect configurations to legacy Vercel projects:

### 1. `snhu-degreemap.vercel.app`
- All paths `/*` -> `https://snhu-tools.vercel.app/*` (1-to-1 exact path mapping).

### 2. `snhu-courses.vercel.app`
- `/` -> `https://snhu-tools.vercel.app/courses`
- `/courses` -> `https://snhu-tools.vercel.app/courses`
- `/course/:id` -> `https://snhu-tools.vercel.app/courses/:id`
- `/courses/:id` -> `https://snhu-tools.vercel.app/courses/:id`
- `/api/courses` -> `https://snhu-tools.vercel.app/api/courses`
- `/api/courses/search` -> `https://snhu-tools.vercel.app/api/courses/search`
- `/api/course/:id` -> `https://snhu-tools.vercel.app/api/course/:id`
- `/api/course-tree/:id` -> `https://snhu-tools.vercel.app/api/course-tree/:id`
- `/api/course-trees/:ids` -> `https://snhu-tools.vercel.app/api/course-trees/:ids`

### 3. `snhu-transfers.vercel.app`
- `/` -> `https://snhu-tools.vercel.app/transfers`
- `/browse` -> `https://snhu-tools.vercel.app/transfers/browse`
- `/courses` -> `https://snhu-tools.vercel.app/transfers/courses`
- `/courses/:code` -> `https://snhu-tools.vercel.app/transfers/courses/:code`
- `/subjects` -> `https://snhu-tools.vercel.app/transfers/subjects`
- `/subjects/:sub` -> `https://snhu-tools.vercel.app/transfers/subjects/:sub`
- `/organizations` -> `https://snhu-tools.vercel.app/transfers/organizations`
- `/organizations/:org` -> `https://snhu-tools.vercel.app/transfers/organizations/:org`
- `/levels` -> `https://snhu-tools.vercel.app/transfers/levels`
- `/levels/:lvl` -> `https://snhu-tools.vercel.app/transfers/levels/:lvl`
- `/api/v1/transfer-coverage` -> `https://snhu-tools.vercel.app/api/v1/transfer-coverage`

## Rollback — Application

If `snhu-tools.vercel.app` encounters fatal errors:
- Revert traffic: Users continue accessing legacy domains (`snhu-degreemap.vercel.app`, `snhu-courses.vercel.app`, `snhu-transfers.vercel.app`), which remain untouched and active.
- If legacy redirects have already been deployed: Re-deploy prior application commits to legacy Vercel projects to restore standalone service.

## Rollback — Runtime Database

If PgBouncer connection issues emerge on `snhu-tools`:
- **Tier 1 (Pooler Bypass)**: Change Production `POSTGRES_URL` on `snhu-tools` from the pooled endpoint to the DIRECT Neon connection for `snhu_tools`.
- **Tier 2 (Full Legacy Rollback)**: If `snhu_tools` data is corrupted, point users back to legacy apps which remain backed by independent databases (DB-A, DB-B, existing DB-C).

## Rollback — Writers

If new CircleCI writers fail:
1. Disable new schedules on `snhu-tools`.
2. Re-enable legacy schedules on `snhu-courses`, `snhu-transfers`, and `snhu-degreemap` via CircleCI API.
3. Legacy writers immediately resume populating historical databases.

## Stabilization Window

A minimum **7-day stabilization window** (covering at least one full weekly scheduled writer cycle on Sunday) must elapse before:
- Deleting old databases (DB-A, DB-B, old DB-C transfers database).
- Deleting legacy CircleCI contexts or projects.
- Deleting legacy Vercel projects.
- Connecting automatic GitHub deployments.

## Post-Stabilization Cleanup

Once stabilization succeeds:
1. Remove temporary `noindex` and publish consolidated XML sitemap.
2. Deprecate and archive historical repositories `snhu-degreemap`, `snhu-courses`, and `snhu-transfers`.
3. Drop legacy tables/databases on Neon and Aiven after verified backups.

## Exact Mutation Checklist

| Step | System | Exact Logical Action | Prerequisite | Success Criterion | Rollback Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Vercel | Set `SNHU_TOOLS_DATABASE_MODE=unified` in Production | None | Variable listed in Production | Remove variable |
| 2 | Vercel | Set `POSTGRES_URL` to pooled `snhu_tools` connection in Production | Step 1 | Variable listed in Production | Remove variable |
| 3 | Vercel | Set `REVALIDATE_SECRET`, `NEXT_PUBLIC_SITE_URL`, Honeybadger keys in Production | Step 2 | Variables listed in Production | Remove variables |
| 4 | Vercel | Run `npx vercel deploy --prod --yes` | Step 3 | Deployment status `● Ready`, alias points to deployment | Promote previous deployment |
| 5 | Vercel | Smoke test routes and APIs on `snhu-tools.vercel.app` | Step 4 | All return HTTP 200 | Promote previous deployment |
| 6 | CircleCI | Follow `gh/andrewtryder/snhu-tools` | Step 5 | Project visible in CircleCI | Unfollow project |
| 7 | CircleCI | Create contexts `snhu-tools-program-sync`, `course-sync`, `transfer-sync` with DIRECT DB URL | Step 6 | Contexts listed via API | Delete contexts |
| 8 | CircleCI | Manually trigger `sync-program-catalog` | Step 7 | Pipeline succeeds (`promoted`/`skipped`) | Re-run or fix config |
| 9 | CircleCI | Manually trigger `sync-course-catalog` | Step 8 | Pipeline succeeds (`promoted`/`skipped`) | Re-run or fix config |
| 10 | CircleCI | Manually trigger `sync-transfer-data` | Step 9 | Pipeline succeeds (`promoted`/`skipped`) | Re-run or fix config |
| 11 | CircleCI | Disable legacy schedules on `snhu-courses`, `snhu-transfers`, `snhu-degreemap` | Step 10 | Schedules show disabled | Re-enable legacy schedules |
| 12 | CircleCI | Create 3 new schedules on `snhu-tools` (03:00, 04:00, 05:00 UTC Sun) | Step 11 | Schedules show enabled | Delete new schedules |
| 13 | Vercel | Deploy HTTP 308 redirect configs to `snhu-degreemap`, `snhu-courses`, `snhu-transfers` | 24h of stable traffic | Redirects return 308 to `snhu-tools.vercel.app` | Re-deploy legacy apps |

## Go / No-Go Criteria

- **GO**: All 13 checklist steps verified in order; 0 connection-timeout errors; smoke test passes completely.
- **NO-GO**: Any failure in steps 1-5 immediately halts before CircleCI modifications; legacy applications and writers remain authoritative.
