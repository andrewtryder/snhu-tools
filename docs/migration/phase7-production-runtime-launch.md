# Phase 7 Production Runtime Launch

## Source Checkpoint

- **Git Branch**: `integration/snhu-tools`
- **Source SHA**: `5d73c5cf55d5fed4a88919f2bc1720b263dbcef2`
- **Pre-Cutover Deployment**: `dpl_HYS8RAiAbeNZenKGKnYkxbcG5Aou` (`https://snhu-tools-omz3oozv1-andrewtryder.vercel.app`)

## Production Environment

Variables configured on `snhu-tools` Production:

- `SNHU_TOOLS_DATABASE_MODE` (`unified`)
- `POSTGRES_URL` (Neon PgBouncer POOLED connection to `snhu_tools`)
- `REVALIDATE_SECRET` (Dedicated production secret)
- `NEXT_PUBLIC_SITE_URL` (`https://snhu-tools.vercel.app`)
- `HONEYBADGER_API_KEY` (Dedicated `snhu-tools` Honeybadger project reporting key)
- `NEXT_PUBLIC_HONEYBADGER_API_KEY` (Same dedicated `snhu-tools` Honeybadger project reporting key)

Preview environment variables were verified completely untouched.

## Runtime Architecture

- **Database Mode**: `unified` (Single shared pool across Programs, Courses, Transfers)
- **Pool Sizing**: `max: 1`
- **Timeouts**: `idleTimeoutMillis: 5_000`, `connectionTimeoutMillis: 15_000`
- **Database Endpoint**: Neon PgBouncer pooled connection multiplexed into `snhu_tools`
- **Writers**: Direct connection architecture retained for future CircleCI execution

## Deployment

- **Deployment ID**: `dpl_AtKxJSsr7HaUUsEgFmY8gr1i5z5D`
- **Deployment URL**: `https://snhu-tools-3x3smd5ke-andrewtryder.vercel.app`
- **Canonical Aliases**:
  - `https://snhu-tools.vercel.app`
  - `https://snhu-tools-andrewtryder.vercel.app`
- **Build Status**: `● Ready` (Next.js 16.3.2, Node 24.x, Region `iad1`)
- **Git Integration**: Disconnected (CLI-controlled production launch)

## Smoke Tests

All tested endpoints on `https://snhu-tools.vercel.app`:

| Route / API | HTTP Status | Response Time | Result |
| :--- | :--- | :--- | :--- |
| `GET /` | 200 OK | 791ms | SNHU Tools portal landing page loaded |
| `GET /about` | 200 OK | 201ms | Unified About page loaded |
| `GET /programs` | 200 OK | 271ms | Degree catalog directory loaded |
| `GET /programs/accounting-bs` | 200 OK | 1005ms | Program detail & graph loaded |
| `GET /programs/accounting-bs/requirements` | 200 OK | 327ms | Requirement table loaded |
| `GET /api/search?q=accounting` | 200 OK | 558ms | Autocomplete JSON results returned |
| `GET /courses` | 200 OK | 616ms | Course catalog explorer loaded |
| `GET /courses/CS210` | 200 OK | 255ms | Course detail & prerequisite tree loaded |
| `GET /api/courses/search?q=ACC` | 200 OK | 165ms | Course search JSON returned |
| `GET /api/course/CS210` | 200 OK | 90ms | Direct course JSON returned |
| `GET /api/course-tree/CS210` | 200 OK | 138ms | Recursive prerequisite tree JSON returned |
| `GET /api/course-trees/CS210,CS330` | 200 OK | 122ms | Multi-course prerequisite trees returned |
| `GET /transfers` | 200 OK | 115ms | Transfer explorer hub loaded |
| `GET /transfers/browse` | 200 OK | 144ms | Transfer directory hub loaded |
| `GET /transfers/courses` | 200 OK | 107ms | Transfer course directory loaded |
| `GET /transfers/subjects` | 200 OK | 95ms | Transfer subjects directory loaded |
| `GET /transfers/organizations` | 200 OK | 95ms | Transfer partner organizations loaded |
| `GET /transfers/levels` | 200 OK | 98ms | Academic levels directory loaded |
| `GET /transfers/courses/acc201` | 200 OK | 106ms | Course transfer equivalencies loaded |
| `GET /api/v1/transfer-coverage?courses=ACC201,CS210` | 200 OK | 146ms | Transfer coverage JSON (schemaVersion 1) returned |

## Cross-Domain Validation

- Program requirements dynamically integrate transfer coverage metadata.
- Transfer equivalency pages contain relative internal links to course details (`/courses/...`).
- No external HTTP calls made to legacy standalone applications (`snhu-courses.vercel.app`, `snhu-transfers.vercel.app`, `snhu-degreemap.vercel.app`).
- Canonical URLs on all representative pages correctly point to `https://snhu-tools.vercel.app`.

## Revalidation Validation

Tested authenticated cache invalidation against Production:

- **Endpoint**: `POST https://snhu-tools.vercel.app/api/revalidate?scope=programs`
- **Authorization**: `Bearer <REVALIDATE_SECRET>`
- **Response**: `200 OK`
- **Payload**: `{"revalidated":true,"scope":"programs","tags":["program-data"],"paths":[],"timestamp":"2026-09-02T14:05:34.304Z"}`

## Runtime Logs

Inspected production deployment logs for `dpl_AtKxJSsr7HaUUsEgFmY8gr1i5z5D`:

- Fatal/Error count: **0**
- Connection timeout errors: **0**
- Too many connections / remaining slot errors: **0**
- Prepared statement errors: **0**
- Missing environment variable errors: **0**

## Connection Observation

Observed point-in-time PostgreSQL backend sessions to `snhu_tools` via read-only diagnostic query:

- Total backend sessions: **1**
- Active sessions: **1** (diagnostic query itself)
- PgBouncer multiplexing validated: Zero connection accumulation under mixed traffic.

## Indexability State

- **Programs & Root**: Standard production indexing (`index, follow`).
- **Courses**: Temporary `noindex, nofollow` preserved as planned.
- **Transfers**: Temporary `noindex, nofollow` preserved as planned.

## Legacy Safety

- `snhu-degreemap` (`https://snhu-degreemap.vercel.app`): Untouched, active HTTP 200.
- `snhu-courses` (`https://snhu-courses.vercel.app`): Untouched, active HTTP 200.
- `snhu-transfers` (`https://snhu-transfers.vercel.app`): Untouched, active HTTP 200.
- No HTTP 308 redirects deployed to legacy domains.

## CircleCI State

- `snhu-tools` CircleCI project: **Not yet activated**.
- Contexts: Not created.
- Schedules: Not created.
- Legacy writers: Intact on legacy weekly schedules.

## Observability

- **Honeybadger Project**: Dedicated `snhu-tools` project.
- **Production Variables**: Both `HONEYBADGER_API_KEY` and `NEXT_PUBLIC_HONEYBADGER_API_KEY` configured from the same `snhu-tools` project reporting key.
- **Legacy Projects**: No legacy Honeybadger projects reused.
- No intentional Production fault injection was performed.

## Rollback State

- **Rollback Required**: **No**. All smoke tests, API contracts, database queries, and log inspections passed without error.
- Deployment remains live on canonical production.

## Recommendation

The Vercel Production runtime for `snhu-tools` is verified healthy, performant, and stable. It is ready for the approval-gated CircleCI writer cutover.
