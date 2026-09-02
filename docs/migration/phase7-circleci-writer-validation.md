# Phase 7 CircleCI Writer Validation

## Scope

Manual validation of the three consolidated background catalog synchronization writers against `snhu_tools` in CircleCI before scheduling activation.

## Source Checkpoint

- **Git Branch**: `integration/snhu-tools`
- **Source SHA**: `0e6bb3f375b7e0e48eec372a0c19fde35f267bee`
- **Active Production Deployment**: `dpl_Be3sxfaANGB4ABpfLqEtiZ2JqNv9` (`https://snhu-tools.vercel.app`)

## CircleCI Project

- **Repository**: `gh/andrewtryder/snhu-tools`
- **Project ID**: `5b4bc569-1d1d-4ab4-ab01-1e6b3f3f07c3`
- **Validation Branch**: `integration/snhu-tools`
- **Project Follow Status**: Active

## Contexts

Three dedicated contexts created for the consolidated project:

1. **`snhu-tools-program-sync`**:
   - `HONEYBADGER_API_KEY`
   - `KUALI_CATALOG_YEAR_LABEL` (`2025-2026`)
   - `POSTGRES_URL` (Direct Neon connection to `snhu_tools`)
   - `REVALIDATE_SECRET` (Matching rotated Vercel Production secret)
   - `SITE_URL` (`https://snhu-tools.vercel.app`)

2. **`snhu-tools-course-sync`**:
   - `HONEYBADGER_API_KEY`
   - `POSTGRES_URL` (Direct Neon connection to `snhu_tools`)
   - `REVALIDATE_SECRET` (Matching rotated Vercel Production secret)
   - `SITE_URL` (`https://snhu-tools.vercel.app`)

3. **`snhu-tools-transfer-sync`**:
   - `HONEYBADGER_API_KEY`
   - `POSTGRES_URL` (Direct Neon connection to `snhu_tools`)
   - `REVALIDATE_SECRET` (Matching rotated Vercel Production secret)
   - `SITE_URL` (`https://snhu-tools.vercel.app`)

## Connection Architecture

- **Vercel Web Runtime**: Neon PgBouncer POOLED connection to `snhu_tools` (`max: 1`, `15_000ms` connection establishment timeout).
- **CircleCI Writers**: Neon DIRECT connection to `snhu_tools` for transactional migration locks and DDL compatibility.

## Programs Manual Validation

- **Pipeline Number**: 2 (`e1bdb150-88c8-4792-9d01-7297f1e67c73`)
- **Job Name**: `sync-program-catalog` (Job ID: `5ea0edee-03c6-4a5e-bf18-bfc1dedf5028`)
- **Workflow Status**: `success`
- **Database Migrations**: `PASS` (`npm run db:migrate` completed cleanly)
- **Terminal Action**: `promoted`
- **Cursor / Import Summary**: 227 expected, 227 imported, 0 failed
- **Validator Result**: `validation-exit-code: 0`
- **Revalidation Result**: `revalidation-exit-code: 0` (`POST https://snhu-tools.vercel.app/api/revalidate?scope=programs` -> HTTP 200 OK)
- **Post-Run Database State**: `status: idle`, `lease_expires_at: null`, `failed_count: 0`, 227 programs live

## Courses Manual Validation

- **Pipeline Number**: 3 (`bc510cd7-d5b8-4a7d-8b51-157c9e8eee5d`)
- **Job Name**: `sync-course-catalog` (Job ID: `adfba6ab-f7c1-4f43-ac8c-17c2e6b06735`)
- **Workflow Status**: `success`
- **Database Migrations**: `PASS` (`npm run db:migrate` completed cleanly)
- **Terminal Action**: `skipped`
- **Skipped Reason**: `not_due` (`next_due_at: 2026-11-02T01:16:38.927Z`)
- **Validator Result**: `validation-exit-code: 0`
- **Revalidation Result**: Intentionally skipped (`revalidation-exit-code: 0`)
- **Post-Run Database State**: `status: idle`, `lease_expires_at: null`, 2394 courses live and intact

## Transfers Manual Validation

- **Pipeline Number**: 4 (`df4353d9-517b-4dd8-bcb5-d79857192d7b`)
- **Job Name**: `sync-transfer-data` (Job ID: `7dc5935d-5f28-4085-8b04-35aab239a3c3`)
- **Workflow Status**: `success`
- **Database Migrations**: `PASS` (`npm run db:migrate` completed cleanly)
- **Terminal Action**: `skipped`
- **Skipped Reason**: `not_due` (`next_due_at: 2026-09-09T01:50:19.302Z`)
- **Validator Result**: `validation-exit-code: 0`
- **Revalidation Result**: Intentionally skipped (`revalidation-exit-code: 0`)
- **Post-Run Database State**: `status: idle`, `lease_expires_at: null`, `failed_experience_count: 0`, 1179 transfer courses live and intact

## Migration Idempotency

- `npm run db:migrate` executed sequentially across all 3 writer workflows.
- All 3 migration runs succeeded without conflicts, locks, or schema errors.
- Table schemas and existing data fingerprints remained fully intact across the entire validation sequence.

## Production Post-Writer Validation

- All public route families (`/programs`, `/courses`, `/transfers`, `/api/search`, `/api/courses/search`, `/api/v1/transfer-coverage`) verified returning HTTP 200 OK.
- Runtime log review for deployment `dpl_Be3sxfaANGB4ABpfLqEtiZ2JqNv9` returned 0 application or database connectivity errors.
- Zero connection exhaustion or connection timeout errors detected.

## Honeybadger

- Dedicated `snhu-tools` project reporting key populated across all 3 contexts.
- No writer failed during validation; zero error events injected.

## Legacy Writer Safety

- Legacy schedules remain enabled:
  - `weekly-snhu-course-catalog-sync` on `snhu-courses` (Sunday 03:00 UTC)
  - `weekly-snhu-transfer-sync` on `snhu-transfers` (Sunday 04:00 UTC)
  - `weekly-snhu-degree-catalog-sync` on `snhu-degreemap` (Sunday 05:00 UTC)
- Legacy CircleCI contexts and projects remain completely untouched.

## New Schedule State

- `snhu-tools` scheduled triggers: **0** (no automated schedules created during manual validation).

## Recommendation

All 3 background writers have been verified end-to-end under real CircleCI execution against `snhu_tools`. The project is fully ready for the atomic schedule cutover (disabling legacy schedules and enabling the staggered Sunday schedules on `snhu-tools`).
