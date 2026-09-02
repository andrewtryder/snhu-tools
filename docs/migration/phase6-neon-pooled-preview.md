# Phase 6 Neon Pooled Preview Validation

## Scope

Configure ONLY the `snhu-tools` Vercel Preview environment to use the Neon PgBouncer pooled connection for `snhu_tools`, create exactly one new Preview deployment, and validate end-to-end functionality across Programs, Courses, Transfers, APIs, and cross-domain relationships without modifying Production or mutating Neon resources.

## Starting Checkpoint

- Repository: `andrewtryder/snhu-tools`
- Branch: `integration/snhu-tools`
- Canonical-host readiness commit: `6ccb045ff680ce1f3060590e7f4a040bf2615e32` (`fix: set snhu-tools canonical origin`)
- Working tree at start: Clean

## Neon Connection Model

- Direct baseline: Previously validated in Phase 6 direct Preview
- Pooled runtime: Neon PgBouncer pooled connection (`<endpoint>-pooler.<region>.neon.tech`)
- Database: `snhu_tools` on approved DB-C Neon project
- Neon resource mutation: **No** (no project, branch, endpoint, compute, role, or pooler toggle modified)
- Role & database parity: Verified read-only pre-flight (`transaction_read_only = on`, database = `snhu_tools`, exact match with direct connection)

## Vercel Preview Configuration

- `SNHU_TOOLS_DATABASE_MODE`: `unified` (Preview only)
- `POSTGRES_URL`: Encrypted Secret in Preview pointing to Neon pooled endpoint (value omitted)
- Production environment: **Zero** database or runtime environment variables configured

## Deployment

- Command: `npx vercel deploy --target preview --yes`
- Deployment ID: `dpl_B2PhzNHCeirLK1GeRC5S9apYAHeV`
- Preview URL: `https://snhu-tools-cr2ynhtti-andrewtryder.vercel.app`
- Target: `preview` (`target: null` / `preview`)
- Source SHA: `6ccb045ff680ce1f3060590e7f4a040bf2615e32`
- Framework Preset: `Next.js`
- Build Result: **PASS** (Turbopack compilation in 2.9s, TypeScript verification in 8.1s, 26 static pages generated)

## Programs Validation

- `/programs`: HTTP 200
- `/programs/accounting-bs`: HTTP 200
- `/programs/accounting-bs/requirements`: HTTP 200
- `/api/search?q=accounting`: HTTP 200 (valid JSON returned)

## Courses Validation

- `/courses`: HTTP 200
- `/courses/CS210`: HTTP 200
- `/api/courses/search?q=ACC`: HTTP 200
- `/api/course/CS210`: HTTP 200
- `/api/course-tree/CS210`: HTTP 200 (recursive prerequisite hierarchy resolved)
- `/api/course-trees/CS210,CS330`: HTTP 200 (multi-course tree resolved)

## Transfers Validation

- `/transfers`: HTTP 200
- `/transfers/browse`: HTTP 200
- `/transfers/courses`: HTTP 200
- `/transfers/courses/acc201`: HTTP 200
- `/transfers/subjects`: HTTP 200
- `/transfers/organizations`: HTTP 200
- `/transfers/levels`: HTTP 200

## API Validation

- `/api/v1/transfer-coverage?courses=ACC201,CS210`: HTTP 200 (schemaVersion 1, matched 2 courses, courseUrls link to canonical `/transfers/courses/...`)
- `/api/search?q=business`: HTTP 200
- `/api/courses/search?q=CS`: HTTP 200

## Cross-Domain Validation

- Program -> Transfer: `/programs/accounting-bs` renders dynamic links to `/transfers/courses/...` via in-process `getTransferCoverageResponse()`, with zero external HTTP dependency on `snhu-transfers.vercel.app`.
- Transfer -> Course: `/transfers/courses/cs210` renders direct internal links to `/courses/CS210`.

## Sequential Mixed-Request Stability

- Executed 26 sequential route and API requests across all domains (Programs, Courses, Transfers, and APIs).
- Result: **26 / 26 returned HTTP/2 200 OK**.
- Connection reuse: Connections reused cleanly through `globalThis.pgPool` without connection leaks or socket exhaustion.

## Direct vs Pooled Functional Parity

| Domain | Direct Preview Result | Pooled Preview Result | Parity Classification |
| :--- | :--- | :--- | :--- |
| Programs | PASS | PASS | Identical behavior |
| Courses | PASS | PASS | Identical behavior |
| Transfers | PASS | PASS | Identical behavior |
| Course Trees & Prereqs | PASS | PASS | Identical behavior |
| Transfer Coverage API | PASS | PASS | Identical behavior |
| Cross-Domain Linking | PASS | PASS | Identical behavior |
| Search & Autocomplete | PASS | PASS | Identical behavior |
| Error Handling (404/400) | PASS | PASS | Identical behavior |

## Runtime Error Review

- Prepared-statement / PgBouncer protocol errors: **None**
- Connection exhaustion errors: **None**
- Missing legacy URL warnings (`COURSES_POSTGRES_URL`, `TRANSFERS_POSTGRES_URL`): **None**
- Cold-wake connection establishment timeout: Initial requests against a suspended Neon compute encountered `Connection terminated due to connection timeout` with the runtime pool's current 5-second connection timeout (`connectionTimeoutMillis: 5_000`). Once compute was awake, functional and sequential validation passed completely (26/26 200 OK). This is not connection-slot exhaustion, but an establishment timeout during serverless compute resume.

## Connection Observation

- Point-in-time database backend inspection via direct read-only client:
  - Total connections to `snhu_tools`: 2 (1 inspection query client + 1 idle serverless connection)
  - Active backend connections: 1
- **PgBouncer multiplexing distinction**: Because Neon PgBouncer operates in transaction-pooling mode, multiple concurrent or sequential Vercel serverless function invocations are multiplexed across a minimal number of actual PostgreSQL backend processes. Session connection counts observed at the database level remain near 1-2 rather than scaling linearly with serverless concurrency.

## Production Safety

- Production `POSTGRES_URL`: Not configured (0 variables)
- Production `SNHU_TOOLS_DATABASE_MODE`: Not configured
- Production deployment: Left untouched
- Production promotion: None
- Production alias (`snhu-tools.vercel.app`): Untouched
- Indexability: `x-robots-tag: noindex` and Vercel Deployment Protection active

## Legacy Project Safety

- Legacy Vercel projects (`snhu-degreemap`, `snhu-courses`, `snhu-transfers`): All completely untouched.

## Writer Endpoint Strategy

- **Vercel Serverless Runtime**: Uses Neon PgBouncer pooled connection (`<endpoint>-pooler.<region>.neon.tech`) for high-concurrency client multiplexing.
- **Migrations & CircleCI Writers**: Retain Neon direct connection (`<endpoint>.<region>.neon.tech`) for transaction locks, session leases, and DDL migrations.

## Known Production Blockers

1. **Cold-Wake Timeout Hardening**: The canonical runtime pool's 5-second connection timeout is too aggressive for suspended Neon compute wake latency. Code hardening (increasing `connectionTimeoutMillis` to 15 seconds) and cold-wake Preview revalidation are required before production cutover.
2. **Production Environment Cutover**: Remote Vercel Production database environment variables remain unconfigured.
3. **CircleCI Context & Remote Writers**: Production CircleCI context and automated writers remain deferred.
4. **Legacy Domain 308 Redirects**: Standalone redirect projects remain deferred to Phase 7 cutover.
5. **Production SEO & Sitemap Cutover**: Removing temporary `noindex` and publishing the full course sitemap remains deferred to Phase 7 cutover.

## Recommendation

The Neon pooled Preview deployment **PASSED** functional route, API, cross-domain, and sequential stability testing with the PgBouncer pooled connection in unified mode. However, Production cutover remains blocked on cold-wake connection timeout hardening (adjusting `connectionTimeoutMillis` to 15 seconds) and subsequent cold-wake revalidation.
