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
  - No migration, bootstrap, or synchronization operation has been executed; the authoritative target remains unselected, runtime retains three temporary pools, provider topology inspection remains pending, and CircleCI consolidation remains Phase 5C.
  - Correction pass: trusted Course and Transfer CLIs now own one claimed lease and sync ID for their full run, use terminal-result validators, and explicitly report caught writer failures to Honeybadger when configured. Owned full-run tests, CLI wrapper tests, terminal validator tests, standalone tsx import smoke checks, and sanitized writer-error reporting now directly protect writer execution.

## Settled Decisions
- Degree Map is the foundation and primary product experience of SNHU Tools
- Canonical navigation: **Programs** (`/programs`) | **Courses** (`/courses`) | **Transfers** (`/transfers`) | **About** (`/about`)
- Canonical target host: `https://snhu-tools.vercel.app`
- Legacy sites (`snhu-degreemap.vercel.app`, `snhu-courses.vercel.app`, `snhu-transfers.vercel.app`) will remain standalone Vercel redirect-only projects
- Permanent legacy redirects will use HTTP 308
- Database topology and infrastructure consolidation deferred to a dedicated phase
- CircleCI context strategy deferred to a dedicated phase

## Upcoming
- **Phase 5: Database & CircleCI Pipeline Consolidation**: Unify schema migrations (`scripts/migrate.ts`), catalog synchronization scripts, and CircleCI scheduled workflows.
- **Phase 6: Vercel Preview & Staging Verification**: End-to-end audit of all route families, dynamic graphs, search autocomplete, transfer coverage, and sitemaps.
- **Phase 7: Production Cutover & Legacy Redirects**: Deploy unified application to production, submit XML sitemap to search engines, and deploy HTTP 308 redirect configurations to legacy repositories.

## Known Deferred Decisions & Migration Items
- **Temporary Three-Pool Runtime Topology**: Programs uses `POSTGRES_URL` / `pgPool`, Courses uses `COURSES_POSTGRES_URL` / `coursesPgPool`, and Transfers uses `TRANSFERS_POSTGRES_URL` / `transfersPgPool`. Each pool remains `max: 1`. This temporary multi-database bridge is not the desired final topology and will be evaluated during Phase 5.
- **Courses Write/Sync Pipeline**: Catalog sync jobs (`scripts/catalog-sync.ts`, `scripts/catalog-bootstrap.ts`, `/api/cron/catalog-sync`) and CircleCI workflows remain deferred to Phase 5.
- **Scoped Revalidation Callers**: CircleCI callers have not yet been changed to send revalidation scopes; they retain the backward-compatible default `programs` scope until Phase 5.
- **Unified Sitemap & Indexing Cutover**: Addition of course URLs to `sitemap.ts` and removing temporary `noindex` headers on Courses routes remains deferred to the Phase 7 SEO cutover.
- **Legacy Domain Redirects**: 308 redirects from `snhu-courses.vercel.app/*` to `snhu-tools.vercel.app/courses/*` remain deferred until legacy redirect deployments in Phase 7.
- **Production Database Topology**: Final determination between consolidating all domain tables (`programs*`, `courses_data*`, `transfer_courses*`) into a single shared PostgreSQL database instance vs. maintaining separate database connections will be evaluated during Phase 5.
- **CircleCI Context Migration**: Evaluation of whether to merge `snhu-degreemap-sync-context`, `snhu-courses-sync`, and `snhu-transfers-sync` into a unified `snhu-tools-sync-context` will occur during CircleCI consolidation.
