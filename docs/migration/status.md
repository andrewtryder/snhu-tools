# SNHU Tools Migration Status

## Completed
- Architecture inventory (`docs/migration/inventory.md`)
- Unified application shell and navigation (Phase 1)

## Settled Decisions
- Degree Map is the foundation and primary product experience of SNHU Tools
- Canonical navigation: **Programs** (`/programs`) | **Courses** (`/courses`) | **Transfers** (`/transfers`) | **About** (`/about`)
- Canonical target host: `https://snhu-tools.vercel.app`
- Legacy sites (`snhu-degreemap.vercel.app`, `snhu-courses.vercel.app`, `snhu-transfers.vercel.app`) will remain standalone Vercel redirect-only projects
- Permanent legacy redirects will use HTTP 308
- Database topology and infrastructure consolidation deferred to a dedicated phase
- CircleCI context strategy deferred to a dedicated phase

## Upcoming
- **Phase 2: Courses Migration**: Port course catalog directory, single-course prerequisite visualizer, dependent courses tree, and course API endpoints.
- **Phase 3: Transfers Migration**: Port Drizzle ORM transfer tables, search hub, directory listings (courses, subjects, organizations, levels), and equivalency tables.
- **Phase 4: In-Process Transfer Coverage & API Unification**: Eliminate HTTP fetch from Degree Map to Transfers by invoking `getTransferCoverageResponse()` in-process; unify on-demand `/api/revalidate`.
- **Phase 5: Database & CircleCI Pipeline Consolidation**: Unify schema migrations (`scripts/migrate.ts`), catalog synchronization scripts, and CircleCI scheduled workflows.
- **Phase 6: Vercel Preview & Staging Verification**: End-to-end audit of all route families, dynamic graphs, search autocomplete, transfer coverage, and sitemaps.
- **Phase 7: Production Cutover & Legacy Redirects**: Deploy unified application to production, submit XML sitemap to search engines, and deploy HTTP 308 redirect configurations to legacy repositories.

## Known Deferred Decisions
- **Production Database Topology**: Final determination between consolidating all domain tables (`programs*`, `courses_data*`, `transfer_courses*`) into a single shared PostgreSQL database instance vs. maintaining separate database connections will be evaluated during Phase 5.
- **CircleCI Context Migration**: Evaluation of whether to merge `snhu-degreemap-sync-context`, `snhu-courses-sync`, and `snhu-transfers-sync` into a unified `snhu-tools-sync-context` will occur during CircleCI consolidation.
