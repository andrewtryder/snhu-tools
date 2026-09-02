# Phase 7 Legacy Redirect Cutover

## Scope

Conversion of the three existing standalone legacy Vercel projects (`snhu-courses`, `snhu-transfers`, and `snhu-degreemap`) into lightweight, redirect-only Production deployments using permanent HTTP 308 redirects to the consolidated canonical application at `https://snhu-tools.vercel.app`.

## Source Checkpoint

- **Unified Application Commit SHA**: `0c7d200223b82b9fd64d17bcd341cc8412e8b238`
- **Branch**: `integration/snhu-tools`
- **Unified Production URL**: `https://snhu-tools.vercel.app` (`dpl_7PonnVQN8WsU78uaKEMx4YFDi3Sz`)

## Redirect Architecture

- **Deployment Pattern**: Pure static redirect-only Vercel deployments configured via minimal `vercel.json` artifacts with `"framework": null` and `"buildCommand": null`.
- **Edge Routing**: All incoming HTTP traffic is evaluated and redirected directly at the Vercel edge/CDN level with zero serverless function overhead or database connection requirements.
- **Legacy Git Repositories**: Completely untouched, unedited, and uncommitted throughout cutover.
- **Legacy Vercel Projects**: Retained under their original project identities; no projects deleted or renamed, and no DNS or custom domain ownership modified.

## Rollback Deployments

Prior application deployments recorded as immediate rollback targets before replacing production:

- **COURSES_ROLLBACK_DEPLOYMENT**: `dpl_AGCXL2vxcxwHGRq1Rw8PD8mWjFNR` (`https://snhu-courses-md2k1e1rj-andrewtryder.vercel.app`)
- **TRANSFERS_ROLLBACK_DEPLOYMENT**: `dpl_BruVJV9xmXQ9eQa578PRYQ7meyoe` (`https://snhu-transfers-k3entt4uq-andrewtryder.vercel.app`)
- **DEGREEMAP_ROLLBACK_DEPLOYMENT**: `dpl_31ZXTDUvonuFkmwk4CpG2kwCTr7S` (`https://snhu-degreemap-4y1vg3dk3-andrewtryder.vercel.app`)

## Degree Map Mapping

- **Project**: `snhu-degreemap` (`prj_HKrTt6rjuyMHsWcd6txFTtscnyEx`)
- **Deployment ID**: `dpl_Du2ha6Xz4rpURQpaepcNAgArLj8Q`
- **Deployment URL**: `https://snhu-degreemap-acopw9f06-andrewtryder.vercel.app`
- **Aliases**: `https://snhu-degreemap.vercel.app`
- **Route Mappings (HTTP 308)**:
  - `/` -> `https://snhu-tools.vercel.app/`
  - `/programs/bachelor` -> `https://snhu-tools.vercel.app/programs/bachelors` (single-hop canonical alias)
  - `/programs/certificate` -> `https://snhu-tools.vercel.app/programs/certificates` (single-hop canonical alias)
  - `/:path*` -> `https://snhu-tools.vercel.app/:path*` (preserves all programs, methodology, data-status, about, and query strings)

## Courses Mapping

- **Project**: `snhu-courses` (`prj_tg67LYCHrYU3l4PIhHNr3aNHX8GA`)
- **Deployment ID**: `dpl_2GZ2QhGeatZuhWaQbVtKpHUbEWg8`
- **Deployment URL**: `https://snhu-courses-agx7tjqxb-andrewtryder.vercel.app`
- **Aliases**: `https://snhu-courses.vercel.app`
- **Route Mappings (HTTP 308)**:
  - `/` -> `https://snhu-tools.vercel.app/courses`
  - `/about` -> `https://snhu-tools.vercel.app/about`
  - `/course/:id` -> `https://snhu-tools.vercel.app/courses/:id`
  - `/course/:id/:path*` -> `https://snhu-tools.vercel.app/courses/:id/:path*`
  - `/courses` -> `https://snhu-tools.vercel.app/courses`
  - `/courses/:path*` -> `https://snhu-tools.vercel.app/courses/:path*`
  - `/(.*)` (fallback) -> `https://snhu-tools.vercel.app/courses`

## Transfers Mapping

- **Project**: `snhu-transfers` (`prj_nuQotD2LxnnCoGLDfMRP5koRgdVT`)
- **Deployment ID**: `dpl_7Sty5XJG5qVmZWoC2s1nja6Q3hpy`
- **Deployment URL**: `https://snhu-transfers-idnmx83kk-andrewtryder.vercel.app`
- **Aliases**: `https://snhu-transfers.vercel.app`
- **Route Mappings (HTTP 308)**:
  - `/` -> `https://snhu-tools.vercel.app/transfers`
  - `/about` -> `https://snhu-tools.vercel.app/about`
  - `/browse` -> `https://snhu-tools.vercel.app/transfers/browse`
  - `/browse/:path*` -> `https://snhu-tools.vercel.app/transfers/browse/:path*`
  - `/courses` -> `https://snhu-tools.vercel.app/transfers/courses`
  - `/courses/:courseNumber` -> `https://snhu-tools.vercel.app/transfers/courses/:courseNumber`
  - `/courses/:courseNumber/:path*` -> `https://snhu-tools.vercel.app/transfers/courses/:courseNumber/:path*`
  - `/subjects` -> `https://snhu-tools.vercel.app/transfers/subjects`
  - `/subjects/:subject` -> `https://snhu-tools.vercel.app/transfers/subjects/:subject`
  - `/organizations` -> `https://snhu-tools.vercel.app/transfers/organizations`
  - `/organizations/:organization` -> `https://snhu-tools.vercel.app/transfers/organizations/:organization`
  - `/levels` -> `https://snhu-tools.vercel.app/transfers/levels`
  - `/levels/:level` -> `https://snhu-tools.vercel.app/transfers/levels/:level`
  - `/(.*)` (fallback) -> `https://snhu-tools.vercel.app/transfers`

## Deployment Order

Executed strictly sequentially:
1. `snhu-courses` -> deployed and validated
2. `snhu-transfers` -> deployed and validated
3. `snhu-degreemap` -> deployed and validated

## Validation

- **Status Code**: Permanent HTTP 308 verified across all routes on all three legacy hosts.
- **Query String Preservation**:
  - `https://snhu-degreemap.vercel.app/programs?level=bachelor` -> `https://snhu-tools.vercel.app/programs?level=bachelor` (PASS)
  - `https://snhu-courses.vercel.app/course/CS210?view=prereq` -> `https://snhu-tools.vercel.app/courses/CS210?view=prereq` (PASS)
  - `https://snhu-transfers.vercel.app/courses/acc201?source=search` -> `https://snhu-tools.vercel.app/transfers/courses/acc201?source=search` (PASS)
- **Deep Link Navigation**:
  - Degree Map: `/programs/accounting-bs` -> HTTP 308 -> HTTP 200
  - Degree Map: `/programs/accounting-bs/requirements` -> HTTP 308 -> HTTP 200
  - Courses: `/course/CS210` -> HTTP 308 -> HTTP 200
  - Courses: `/course/CS330` -> HTTP 308 -> HTTP 200
  - Transfers: `/courses/acc201` -> HTTP 308 -> HTTP 200
  - Transfers: `/levels/undergraduate` -> HTTP 308 -> HTTP 200
  - Transfers: `/subjects/cs` -> HTTP 308 -> HTTP 200
- **Canonical Destinations**: All followed requests resolve to `https://snhu-tools.vercel.app/...` with `<link rel="canonical">` matching the destination; zero preview URLs exposed.
- **Redirect Chains / Loops**: Zero redirect chains (exactly 1 hop) and zero redirect loops detected.

## Rollback State

- `snhu-courses`: Rollback Required = **NO** (all validation checks passed).
- `snhu-transfers`: Rollback Required = **NO** (all validation checks passed).
- `snhu-degreemap`: Rollback Required = **NO** (all validation checks passed).

## SEO State

- **Courses**: Temporary `noindex, nofollow` strictly retained on `https://snhu-tools.vercel.app/courses`.
- **Transfers**: Temporary `noindex, nofollow` strictly retained on `https://snhu-tools.vercel.app/transfers`.
- **Search Page**: `noindex, follow` strictly retained on `https://snhu-tools.vercel.app/search`.
- **Sitemap**: Unchanged; no sitemap submissions or Search Console operations performed.

## Production Health

- **Vercel Production Runtime**: 100 requests inspected post-cutover; 0 HTTP 500 errors, 0 runtime exceptions, 0 database connection timeouts.
- **Honeybadger Observability**: 0 redirect-induced errors reported.

## Legacy Repository Safety

Read-only inspection verified all three legacy Git repositories remain completely clean and untouched:
- `~/code/snhu-degreemap` at `2600c316caef72329be7db0950f9d47201eacefd` (clean)
- `~/code/snhu-courses` at `5fdf3b44d27496a8cbb1cdf1609190584890844f` (clean)
- `~/code/snhu-transfers` at `db1024b6e4a69c963126ed848318bc5817b2c94b` (clean)

## Recommendation

Legacy traffic is now 100% migrated to `https://snhu-tools.vercel.app` via permanent HTTP 308 redirects. It is safe to proceed to the separate, final **SEO / Indexing Activation Gate** (removing temporary noindex headers on Courses/Transfers and activating the unified sitemap).
