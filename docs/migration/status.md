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
  - SEO & Crawlability: Structured `Course` and `BreadcrumbList` JSON-LD schemas targeting canonical `/courses/[id]` paths; temporary `noindex` robots metadata retained during integration until canonical production cutover

## Settled Decisions
- Degree Map is the foundation and primary product experience of SNHU Tools
- Canonical navigation: **Programs** (`/programs`) | **Courses** (`/courses`) | **Transfers** (`/transfers`) | **About** (`/about`)
- Canonical target host: `https://snhu-tools.vercel.app`
- Legacy sites (`snhu-degreemap.vercel.app`, `snhu-courses.vercel.app`, `snhu-transfers.vercel.app`) will remain standalone Vercel redirect-only projects
- Permanent legacy redirects will use HTTP 308
- Database topology and infrastructure consolidation deferred to a dedicated phase
- CircleCI context strategy deferred to a dedicated phase

## Upcoming
- **Phase 3: Transfers Migration**: Port Drizzle ORM transfer tables, search hub, directory listings (courses, subjects, organizations, levels), and equivalency tables.
- **Phase 4: In-Process Transfer Coverage & API Unification**: Eliminate HTTP fetch from Degree Map to Transfers by invoking `getTransferCoverageResponse()` in-process; unify on-demand `/api/revalidate`.
- **Phase 5: Database & CircleCI Pipeline Consolidation**: Unify schema migrations (`scripts/migrate.ts`), catalog synchronization scripts, and CircleCI scheduled workflows.
- **Phase 6: Vercel Preview & Staging Verification**: End-to-end audit of all route families, dynamic graphs, search autocomplete, transfer coverage, and sitemaps.
- **Phase 7: Production Cutover & Legacy Redirects**: Deploy unified application to production, submit XML sitemap to search engines, and deploy HTTP 308 redirect configurations to legacy repositories.

## Known Deferred Decisions & Migration Items
- **Temporary Dual-Database Bridge**: Courses connects via an isolated `coursesPgPool` using `COURSES_POSTGRES_URL`. This dual-database arrangement is a temporary migration bridge; before production cutover in Phase 5, database topology will be consolidated so a single Vercel instance does not maintain multiple provider pools.
- **Courses Write/Sync Pipeline**: Catalog sync jobs (`scripts/catalog-sync.ts`, `scripts/catalog-bootstrap.ts`, `/api/cron/catalog-sync`) and CircleCI workflows remain deferred to Phase 5.
- **Catalog Revalidation Consolidation**: On-demand invalidation for the `catalog-data` tag remains deferred until `/api/revalidate` is unified in Phase 4.
- **Unified Sitemap & Indexing Cutover**: Addition of course URLs to `sitemap.ts` and removing temporary `noindex` headers on Courses routes remains deferred to the Phase 7 SEO cutover.
- **Legacy Domain Redirects**: 308 redirects from `snhu-courses.vercel.app/*` to `snhu-tools.vercel.app/courses/*` remain deferred until legacy redirect deployments in Phase 7.
- **Production Database Topology**: Final determination between consolidating all domain tables (`programs*`, `courses_data*`, `transfer_courses*`) into a single shared PostgreSQL database instance vs. maintaining separate database connections will be evaluated during Phase 5.
- **CircleCI Context Migration**: Evaluation of whether to merge `snhu-degreemap-sync-context`, `snhu-courses-sync`, and `snhu-transfers-sync` into a unified `snhu-tools-sync-context` will occur during CircleCI consolidation.
