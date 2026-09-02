# SNHU Tools Migration Status

## Completed
- Architecture inventory (`docs/migration/inventory.md`)
- Unified application shell and navigation (Phase 1)
- Courses feature migration (Phase 2)
  - Source repository: `~/code/snhu-courses` at baseline SHA `5fdf3b44d27496a8cbb1cdf1609190584890844f`
  - Canonical routes: `/courses` (Interactive Explorer + Crawlable Directory) and `/courses/[id]` (Course Detail + Prerequisite Tree + Interactive Graph + Dependents)
  - Internal compatibility redirect: permanent HTTP 308 redirect from `/course/:id` to `/courses/:id`
  - Temporary isolated Courses database bridge via `COURSES_POSTGRES_URL` and `COURSES_POSTGRES_CA_CERT` (`coursesPgPool`), with zero fallback to Degree Map's `POSTGRES_URL`
  - Public read APIs migrated: `/api/courses`, `/api/courses/search`, `/api/course/[id]`, `/api/course-tree/[id]`, `/api/course-trees/[ids]`
- Transfers feature migration (Phase 3)
  - Source repository: `~/code/snhu-transfers` at baseline SHA `db1024b6e4a69c963126ed848318bc5817b2c94b`
  - Canonical routes: `/transfers` (Interactive Explorer + Search Hub), `/transfers/browse` (Directory Hub), `/transfers/courses` (Course Directory Index), `/transfers/courses/[courseNumber]` (Course Transfer Options + In-App Prerequisite Link to `/courses/[id]`), `/transfers/subjects` (Subject Index), `/transfers/subjects/[subject]` (Subject Detail), `/transfers/organizations` (Organization Index), `/transfers/organizations/[organization]` (Organization Detail), `/transfers/levels` (Academic Level Index), `/transfers/levels/[level]` (Level Detail)
  - Temporary isolated Transfers database bridge via `TRANSFERS_POSTGRES_URL` and `TRANSFERS_POSTGRES_CA_CERT` (`transfersPgPool`), with zero fallback to `POSTGRES_URL` or `COURSES_POSTGRES_URL`
  - Lazy Proxy Drizzle ORM read client (`transfersDrizzleDb`) for safe build-time importing without runtime database credentials
  - Public read APIs migrated: `/api/v1/transfer-coverage` with cache headers, input bounds, schema versioning, and canonical `/transfers/courses/[slug]` links
  - SEO & Crawlability: Structured `ItemList` and `BreadcrumbList` JSON-LD schemas serialized with `serializeJsonLd()`; temporary `noindex` robots metadata retained during integration until canonical production cutover
- In-Process Transfer Coverage & API Unification (Phase 4)
  - Programs now calls `getTransferCoverageResponse()` directly in-process; it no longer fetches the Transfers API over HTTP. Bounded 100-course batches and available/unavailable failure semantics remain intact.
  - `TRANSFER_COVERAGE_API_URL`, `NEXT_PUBLIC_TRANSFERS_URL`, and `NEXT_PUBLIC_COURSES_URL` are retired from runtime configuration.
  - Program, graph-drawer, and About navigation now use local `/courses/[id]` and `/transfers/courses/[slug]` routes. The public `/api/v1/transfer-coverage` contract remains available, including absolute `courseUrl` values for external consumers.
  - `POST /api/revalidate` now supports allowlisted `programs`, `courses`, `transfers`, and `all` scopes. No scope defaults to `programs` for existing callers; `transfer-data` also invalidates transfer-coverage cache entries.
- Phase 5B — Domain write-pipeline port (code only)
  - Unified code now contains Programs, Courses, and Transfers migration modules and a deterministic one-client migration orchestrator.
  - Courses and Transfers bootstrap/sync pipelines, structured CLI output, and validators are ported for future authoritative `POSTGRES_URL` write use.
  - At completion of Phase 5B, no migration, bootstrap, or synchronization operation had yet been executed; target selection, provider inspection, and CircleCI cutover were intentionally deferred to later Phase 5 subphases.
  - Correction pass: trusted Course and Transfer CLIs now own one claimed lease and sync ID for their full run, use terminal-result validators, and explicitly report caught writer failures to Honeybadger when configured. Owned full-run tests, CLI wrapper tests, terminal validator tests, standalone tsx import smoke checks, and sanitized writer-error reporting now directly protect writer execution.
  - Phase 5C local CircleCI configuration: three independently parameter-gated writer jobs reference new snhu-tools contexts, use structured terminal validators, preserve sync artifacts, and issue explicit promotion-only scoped revalidation. No remote contexts, schedules, or writer activation have occurred.
  - Phase 5F database creation/migration: the approved DB-C Neon project now contains the new `snhu_tools` logical database with unified Programs, Courses, and Transfers schema only. No application data was bootstrapped; target writers remain inactive, runtime retains the legacy temporary topology, pooling remains disabled, and Vercel/CircleCI remain unchanged. The next approval gate is Programs bootstrap.

## Settled Decisions
- Degree Map is the foundation and primary product experience of SNHU Tools
- Canonical navigation: **Programs** (`/programs`) | **Courses** (`/courses`) | **Transfers** (`/transfers`) | **About** (`/about`)
- Canonical target host: `https://snhu-tools.vercel.app`
- Legacy sites (`snhu-degreemap.vercel.app`, `snhu-courses.vercel.app`, `snhu-transfers.vercel.app`) will remain standalone Vercel redirect-only projects
- Permanent legacy redirects will use HTTP 308
- **Database target architecture**: one consolidated logical PostgreSQL database, `snhu_tools`, hosted on the approved DB-C Neon project; legacy DB-A, DB-B, and existing DB-C remain preserved during stabilization.
- **CircleCI architecture**: three feature-specific contexts, `snhu-tools-program-sync`, `snhu-tools-course-sync`, and `snhu-tools-transfer-sync`; repository-side configuration is complete while remote context/schedule cutover remains pending.

## Phase 5 & 6 Current State

Completed:

- Unified migration and domain write-pipeline code, owned full-run tests, terminal validators, and explicit writer Honeybadger reporting.
- Provider/topology audit and DB-C target selection.
- Creation of `snhu_tools` and successful unified Programs/Courses/Transfers schema migration.
- Empty-schema verification: initial state verified with zero application rows.
- Local unified CircleCI configuration with explicit `programs`, `courses`, and `transfers` revalidation scopes.
- Programs bootstrap into `snhu_tools`: promoted 227 programs, 1,743 requirement groups, 3,391 requirement courses, and 1,599 degree courses without errors or skips (parity classification: `CURRENT_UPSTREAM_DRIFT`).
- Courses bootstrap into `snhu_tools`: promoted 2,394 courses, 2,394 courses_data, and 1,928 prerequisites without errors or skips (parity classification: `CURRENT_UPSTREAM_DRIFT`).
- Transfers bootstrap into `snhu_tools`: promoted 1,179 transfer courses from 889 experiences and enriched 700 course PIDs against the consolidated course catalog (parity classification: `CURRENT_UPSTREAM_DRIFT`).
- Cross-domain non-mutation verified: Programs, Courses, and Transfers all reside with full referential integrity in `snhu_tools`.
- Legacy databases (DB-A, DB-B, existing DB-C) remain completely untouched and available for rollback.
- All three domain data-population gates are **COMPLETE**.
- Shared runtime Pool consolidation implemented behind `SNHU_TOOLS_DATABASE_MODE` (default: `"legacy"`; unified mode: single shared `globalThis.pgPool` with `max: 1`).
- Legacy rollback adapters and environment variables (`COURSES_POSTGRES_URL`, `TRANSFERS_POSTGRES_URL`) fully preserved.
- New Vercel project `snhu-tools` created under `andrewtryder` with GitHub connection deferred for production safety.
- First deployment on new project assigned to Production per Vercel CLI platform default (left untouched, unpromoted, with zero database credentials).
- Initial Preview deployment identified framework preset issue (defaulted to `Other`), which was corrected to `Next.js` with automatic output directory detection.
- Corrected controlled Preview deployment created and **PASSED** full end-to-end validation.
- All Programs (`/programs`, `/programs/[slug]`, `/programs/[slug]/requirements`), Courses (`/courses`, `/courses/[id]`, search, prerequisite trees), and Transfers (`/transfers`, `/transfers/browse`, `/transfers/courses/[courseNumber]`, `/api/v1/transfer-coverage`) verified.
- In-process cross-domain resolution verified: Program requirement transfer coverage computed with zero external HTTP dependency; Transfer records link back directly to the consolidated Course catalog.
- Controlled error handling verified (clean 404/400 JSON/HTML with zero data leaks).
- Runtime logs verified: 0 errors, 0 missing legacy environment variable warnings, 0 connection exhaustion issues.
- Direct Neon endpoint used; Neon provider pooling remains unchanged / disabled.
- Production environment on `snhu-tools` has zero database variables configured.
- Legacy Vercel projects (`snhu-degreemap`, `snhu-courses`, `snhu-transfers`) remain completely untouched.
- SNHU Tools canonical production fallback changed from legacy Degree Map host (`snhu-degreemap.vercel.app`) to settled canonical host (`https://snhu-tools.vercel.app`) in application runtime (`src/lib/siteUrl.ts`), environment docs, and tests (committed in `6ccb045ff680ce1f3060590e7f4a040bf2615e32`).
- Phase 6 Neon pooled Preview deployment (`dpl_B2PhzNHCeirLK1GeRC5S9apYAHeV`) verified: Preview `POSTGRES_URL` updated to use Neon PgBouncer pooled connection while retaining `SNHU_TOOLS_DATABASE_MODE=unified`.
- Single shared application pool (`globalThis.pgPool`) remains active and verified across 26 sequential mixed requests with 100% success rate (26/26 HTTP 200).
- Neon resource configuration was not mutated (no project, branch, endpoint, or compute changes).
- Point-in-time PostgreSQL backend connections to `snhu_tools` remained at 2 (1 active inspection query + 1 idle serverless connection), confirming PgBouncer transaction-level multiplexing without backend connection bloat.
- Writers and migrations retain direct connection architecture; remote CircleCI writers remain inactive.
- Legacy Vercel projects (`snhu-degreemap`, `snhu-courses`, `snhu-transfers`) remain completely untouched.
- Production environment on `snhu-tools` has zero database or runtime environment variables; no Production deployment or promotion performed.
- Runtime connection timeout hardened: Canonical runtime pool `connectionTimeoutMillis` increased from 5 seconds to 15 seconds (`15_000` ms) in `src/lib/db/pool.ts` (committed in `d8a938fe7f4fca64ea3c87e1f6e246835a64a3fa`).
- Phase 6 cold-wake validation deployment (`dpl_FpDts47H9cBKNmShaFurmE4Y5e3T`) verified:
  - Two consecutive naturally suspended Neon compute cold cycles (`idle` state confirmed via Neon control plane) successfully woke on first DB-backed requests (`/api/search` in 6.26s, `/api/courses/search` in 14.60s) returning HTTP/2 200 OK.
  - Zero connection-establishment timeouts reproduced during cold wakes under the 15-second timeout.
  - Functional routes, APIs, and cross-domain linking passed with 100% success rate across 25 sequential mixed requests.
  - Point-in-time PostgreSQL backend connections to `snhu_tools` remained at 1 (0 active), confirming PgBouncer transaction-level multiplexing without connection bloat.
  - Pooled unified database runtime is verified and production-ready from a database connectivity perspective.
- Phase 7 Production runtime launched and verified live on canonical `https://snhu-tools.vercel.app` (`dpl_AtKxJSsr7HaUUsEgFmY8gr1i5z5D`):
  - Production environment configured: `SNHU_TOOLS_DATABASE_MODE=unified`, `POSTGRES_URL` (Neon PgBouncer pooled to `snhu_tools`), `REVALIDATE_SECRET`, `NEXT_PUBLIC_SITE_URL=https://snhu-tools.vercel.app`, and dedicated `snhu-tools` Honeybadger project keys.
  - Canonical aliases `snhu-tools.vercel.app` and `snhu-tools-andrewtryder.vercel.app` promoted and serving live traffic.
  - Smoke tests passed across Programs, Courses, Transfers, and APIs with 0 application/database errors in logs.
  - Scoped revalidation endpoint authenticated and tested successfully (`POST /api/revalidate?scope=programs`).
  - Single pooled database connection observed with zero connection accumulation under mixed traffic.
  - Legacy applications (`snhu-degreemap`, `snhu-courses`, `snhu-transfers`) remain active, untouched, and serving traffic on standalone domains.
  - Temporary `noindex` controls retained on Courses and Transfers.
  - CircleCI remote contexts, schedules, and writers NOT yet cut over (pending next approval gate).

**Next migration milestone:** Phase 7 CircleCI Writer Cutover & Legacy Schedule Retirement.

## Upcoming
- **Phase 7: CircleCI Writer Cutover**: Create new contexts, manually validate writers, activate new Sunday schedules, and retire legacy writer schedules.
- **Phase 7: Legacy Domain Redirects & SEO**: Deploy HTTP 308 redirects to legacy Vercel projects, remove temporary `noindex`, and publish consolidated sitemap.

## Known Deferred Decisions & Migration Items
- **Write/Sync Pipelines**: Migration, bootstrap, and synchronization pipelines have been executed locally against `snhu_tools`. Remote CircleCI automated writer activation on `snhu-tools` remains pending.
- **Scoped Revalidation Callers**: The local unified CircleCI configuration uses explicit `programs`, `courses`, and `transfers` scopes. Remote active callers remain on the legacy writer topology until writer cutover.
- **Unified Sitemap & Indexing Cutover**: Addition of course URLs to `sitemap.ts` and removing temporary `noindex` headers on Courses/Transfers routes remains deferred to post-stabilization SEO cutover.
- **Legacy Domain Redirects**: 308 redirects from legacy projects to `snhu-tools.vercel.app` remain deferred until legacy redirect deployments.
- **Legacy Database Decommissioning**: Deferred for 7-day stabilization period.
