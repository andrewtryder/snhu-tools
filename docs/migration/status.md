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

## Phase 5 Current State

Completed:

- Unified migration and domain write-pipeline code, owned full-run tests, terminal validators, and explicit writer Honeybadger reporting.
- Provider/topology audit and DB-C target selection.
- Creation of `snhu_tools` and successful unified Programs/Courses/Transfers schema migration.
- Empty-schema verification: initial state verified with zero application rows.
- Local unified CircleCI configuration with explicit `programs`, `courses`, and `transfers` revalidation scopes.
- Programs bootstrap into `snhu_tools`: promoted 227 programs, 1,743 requirement groups, 3,391 requirement courses, and 1,599 degree courses without errors or skips.
- Programs parity validation against DB-A: classified as `CURRENT_UPSTREAM_DRIFT` with 100% exact semantic fingerprint match across programs, requirement groups, requirement courses, and degree courses; DB-A, DB-B, and existing DB-C remain untouched.
- Courses and Transfers non-mutation verified: 0 application rows in `snhu_tools`.

Next approval-gated operations:

1. Courses bootstrap into `snhu_tools` and parity validation against DB-B/DB-C.
2. Transfers bootstrap into `snhu_tools` and parity validation against DB-C.
3. Shared runtime Pool conversion and Neon pooled-endpoint/runtime decision.
4. Vercel database cutover.
5. Remote CircleCI context creation, schedule cutover, and legacy writer disablement.

**Next database write gate:** Courses bootstrap into `snhu_tools`, followed immediately by read-only parity validation. Courses bootstrap is pending explicit human approval.

## Upcoming
- **Phase 5: Database & CircleCI Pipeline Consolidation**: Schema migration and local CI configuration are complete; data bootstrap, parity validation, runtime cutover, and remote CI activation remain separately approval-gated.
- **Phase 6: Vercel Preview & Staging Verification**: End-to-end audit of all route families, dynamic graphs, search autocomplete, transfer coverage, and sitemaps.
- **Phase 7: Production Cutover & Legacy Redirects**: Deploy unified application to production, submit XML sitemap to search engines, and deploy HTTP 308 redirect configurations to legacy repositories.

## Known Deferred Decisions & Migration Items
- **Temporary Three-Pool Runtime Topology**: Programs uses `POSTGRES_URL` / `pgPool`, Courses uses `COURSES_POSTGRES_URL` / `coursesPgPool`, and Transfers uses `TRANSFERS_POSTGRES_URL` / `transfersPgPool`. Each pool remains `max: 1`. The database target decision is complete; implementation of the eventual shared runtime Pool remains pending.
- **Courses and Transfers Write/Sync Pipelines**: Migration/bootstrap/sync code exists in snhu-tools. Deferred work is actual bootstrap into `snhu_tools`, parity validation, and new CircleCI writer activation.
- **Scoped Revalidation Callers**: The local unified CircleCI configuration uses explicit `programs`, `courses`, and `transfers` scopes. Remote active callers remain on the legacy writer topology until cutover.
- **Unified Sitemap & Indexing Cutover**: Addition of course URLs to `sitemap.ts` and removing temporary `noindex` headers on Courses routes remains deferred to the Phase 7 SEO cutover.
- **Legacy Domain Redirects**: 308 redirects from `snhu-courses.vercel.app/*` to `snhu-tools.vercel.app/courses/*` remain deferred until legacy redirect deployments in Phase 7.
- **Production Database Topology**: `snhu_tools` on the approved DB-C Neon project is the consolidated database target. Runtime database/pool cutover remains pending until bootstrap, parity, and Vercel approval gates complete.
- **CircleCI Context Migration**: Three new feature-specific contexts are selected; their remote creation, values, schedules, and writer activation remain pending.
