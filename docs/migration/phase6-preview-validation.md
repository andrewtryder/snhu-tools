# Phase 6 Unified Preview Validation

## Approval Scope

New Vercel project creation, framework preset configuration correction, and controlled Preview validation of the unified database runtime (`snhu_tools`).

## Vercel Project

- Project: `snhu-tools`
- Owner: `andrewtryder`
- Local directory link: `~/code/snhu-tools` linked to `andrewtryder/snhu-tools`
- GitHub remote integration: **Deferred** (to avoid automated production deployment triggers)

## Initial Production Special Case

- During the first deployment attempt via `npx vercel deploy --yes`, Vercel CLI 59.10.0 automatically assigned the deployment to `production` per platform default for initial project deployments:
  > `"hint": "This is the project’s first deployment, so it was assigned to production. Future deployments will be preview deployments unless you use --prod."`
- Initial Deployment URL: `https://snhu-tools-omz3oozv1-andrewtryder.vercel.app`
- Initial Alias: `https://snhu-tools.vercel.app`
- Source commit: `19f7557585109cd2e5f85cfc6225107f7673095b`
- Production Environment Variables: **Zero** (no database credentials or runtime mode variables configured in Production).
- Execution stopped immediately per Section 8 protocol for human alignment. The deployment was left untouched, unpromoted, and unconfigured.

## First Preview Routing Failure

- Deployment: `https://snhu-tools-g4mrfmu6p-andrewtryder.vercel.app`
- Cause: CLI project creation defaulted Framework Preset to `Other` (Output Directory: `public` or `.`).
- While `next build` succeeded, Vercel's edge router looked for static files in `public/` and returned HTTP 404 (`x-vercel-error: NOT_FOUND`) for dynamic Next.js routes.

## Vercel Project Correction

- Configuration update command:
  ```bash
  npx vercel project update snhu-tools --framework nextjs --auto-detect output-directory --yes
  ```
- Framework Preset: Updated to **`Next.js`**
- Output Directory: Reset to automatic detection (**`Next.js default`**)
- Unrelated project settings (Node.js version, root directory, sandbox region, build command) remained unchanged.

## Corrected Preview Deployment

- Command: `npx vercel deploy --target preview --yes`
- Deployment Target: **Preview** (`target: null` / `preview`)
- Deployment URL: `https://snhu-tools-hh8e0kdtf-andrewtryder.vercel.app`
- Source commit: `19f7557585109cd2e5f85cfc6225107f7673095b`
- Production Alias repointed: **No** (remains on the initial untouched deployment)
- Build Result: **PASS** (`next build` compiled with Turbopack in 14.2s, 26 static pages generated, dynamic serverless functions emitted)

## Unified Runtime Configuration

- `SNHU_TOOLS_DATABASE_MODE`: `unified` (Preview only)
- `POSTGRES_URL`: Configured Preview encrypted configuration, value omitted
- Database: `snhu_tools` on approved DB-C Neon project
- Endpoint class: Direct Neon PostgreSQL endpoint (no `-pooler` hostname)
- Provider pooling: Disabled / unchanged

## Programs Validation

- `/programs`: HTTP 200 (1.39 MB populated program listing rendered from `snhu_tools`)
- `/programs/accounting-bs`: HTTP 200 (78 KB substantive program detail)
- `/programs/accounting-bs/requirements`: HTTP 200 (119 KB full requirement course graph rendered with credit rules)
- `/api/search?q=accounting`: HTTP 200 (15 matching programs returned as valid JSON)

## Courses Validation

- `/courses`: HTTP 200 (course catalog rendered)
- `/courses/CS210`: HTTP 200 (55 KB course detail with description and prerequisite graph)
- `/api/courses/search?q=ACC`: HTTP 200 (returns ACC 201, 202, 215 catalog course records)
- `/api/course/CS210`: HTTP 200 (JSON course details)
- `/api/course-tree/CS210`: HTTP 200 (recursive prerequisite hierarchy: CS210 -> IT145 -> CS110, IT140 resolved from unified database)
- `/api/course-trees/CS210,CS330`: HTTP 200 (multi-course tree array resolved)

## Transfers Validation

- Route family: `/transfers`, `/transfers/browse`, `/transfers/courses`, `/transfers/subjects`, `/transfers/organizations`, `/transfers/levels` all returned HTTP 200 with populated data
- Transfer detail: `/transfers/courses/acc201` returned HTTP 200 with 13 transfer equivalencies across 11 providers
- Transfer coverage API: `/api/v1/transfer-coverage?courses=ACC201,CS210` returned HTTP 200 with schemaVersion 1 (ACC 201: 13 equivalencies; CS 210: 2 equivalencies)

## Cross-Domain Validation

- Program -> Transfer: `/programs/accounting-bs` dynamically renders direct links to transfer course pages (`/transfers/courses/mat240`, `/transfers/courses/eco201`, `/transfers/courses/acc318`, etc.) via in-process `getTransferCoverageResponse()`, with zero external HTTP dependency on `snhu-transfers.vercel.app`
- Transfer -> Course enrichment: `/transfers/courses/cs210` dynamically renders links to `/courses/CS210`, verifying seamless cross-domain navigation into the Course catalog

## Search Validation

- Course search (`/api/courses/search?q=ACC`): returns valid catalog entries
- Transfer search (`/transfers?q=Sophia`): HTTP 200 initialized filtering
- Global program search (`/api/search?q=computer`): returns matching degree programs

## Invalid-Input Validation

- Unknown Course ID (`/courses/NONEXISTENT999`): HTTP 404 (clean Next.js not-found page)
- Unknown Course API (`/api/course/NONEXISTENT999`): HTTP 404 (`{"error":"Class ID 'NONEXISTENT999' not found."}`)
- Unknown Transfer course (`/transfers/courses/nonexistent999`): HTTP 200 (graceful empty equivalency state)
- Malformed Transfer coverage (`/api/v1/transfer-coverage?courses=`): HTTP 400 (`{"error":{"code":"MISSING_COURSES","message":"The courses query parameter is required."}}`)
- Security check: Zero raw SQL, credentials, stack traces, hostnames, or internal keys exposed.

## Runtime Error Review

- Missing `COURSES_POSTGRES_URL`: **Not observed** (unified mode uses shared `globalThis.pgPool`)
- Missing `TRANSFERS_POSTGRES_URL`: **Not observed** (unified mode uses shared `globalThis.pgPool`)
- Connection exhaustion: **Not observed**
- Log inspection: 33 logged runtime requests all completed with clean `info` level; zero application errors logged.

## Connection Observation

- Point-in-time check of `snhu_tools` PostgreSQL connections:
  - Total connections: 2 (1 observation client + 1 idle serverless container)
  - Active connections: 1
  - Connection leaks / exhaustion: None observed.

## Indexability

- `x-robots-tag: noindex` returned on all Preview responses. Non-indexability confirmed.

## Production Safety

- Initial Production deployment: Left untouched (`https://snhu-tools-omz3oozv1-andrewtryder.vercel.app`)
- Production database environment variables: None (0 variables)
- Production promotion: None
- Additional Production deployments: None (0 created)

## Legacy Project Safety

- Legacy Vercel projects (`snhu-degreemap`, `snhu-courses`, `snhu-transfers`): All completely untouched. No deployments, env changes, or domain modifications.

## Known Production Blockers

1. `src/lib/siteUrl.ts` still contains legacy Degree Map production-host assumptions (`snhu-degreemap.vercel.app`) and needs code correction for `snhu-tools.vercel.app`.
2. Canonical production host update to `snhu-tools.vercel.app`.
3. Neon pooled endpoint decision and infrastructure activation.
4. Production environment variable cutover.
5. Remote CircleCI context creation and writer schedule activation.
6. Legacy domain HTTP 308 redirects.
7. Production SEO / sitemap cutover.

## Recommendation

The corrected unified direct-endpoint Preview deployment **PASSED** all functional route tests, API tests, cross-domain relationship tests, and error-handling tests. The application operates with a single unified connection pool against `snhu_tools` without requiring legacy environment variables. It is recommended to proceed to the next approval gate for reviewing Production-readiness code fixes and provider-pooling evaluation.
