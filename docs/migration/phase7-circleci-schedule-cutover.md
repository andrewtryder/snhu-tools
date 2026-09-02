# Phase 7 CircleCI Schedule Cutover

## Scope

Replacement of legacy weekly CircleCI background synchronization schedules across `snhu-courses`, `snhu-transfers`, and `snhu-degreemap` with unified schedules on `snhu-tools`.

## Source Checkpoint

- **Git Branch**: `integration/snhu-tools`
- **Starting SHA**: `7d7218f09f33ab2980b0924d775906ec1c926143`
- **Active Production Deployment**: `dpl_Be3sxfaANGB4ABpfLqEtiZ2JqNv9` (`https://snhu-tools.vercel.app`)

## CircleCI Schedule API Model

- **API Model**: GitHub OAuth Schedule API (`/api/v2/project/gh/{org}/{repo}/schedule` and `/api/v2/schedule/{schedule_id}`).
- **Legacy Schedule Deactivation**: The GitHub OAuth Schedule API does not support an independent `disabled` toggle flag. Deactivation of legacy schedules was executed by capturing exact configuration definitions to local rollback payloads and deleting the legacy schedule objects via `DELETE /api/v2/schedule/{schedule_id}`.
- **Rollback Semantics**: Recreating the schedule objects on the legacy repositories using the captured parameters and timetable definitions.

## Pre-Cutover Schedule Matrix

| Domain | Legacy Project | Legacy Schedule Name | Schedule ID | Timing |
|---|---|---|---|---|
| Courses | `gh/andrewtryder/snhu-courses` | `weekly-snhu-course-catalog-sync` | `baa8574f-3f0d-46b0-be55-53ae3d6279c9` | Sunday 03:00 UTC |
| Transfers | `gh/andrewtryder/snhu-transfers` | `weekly-snhu-transfer-sync` | `9541ae9d-82cf-4209-afb2-23a5cd70ea5b` | Sunday 04:00 UTC |
| Programs | `gh/andrewtryder/snhu-degreemap` | `weekly-snhu-degree-catalog-sync` | `fa9230fe-13ce-4ecb-ae32-1ed8cd49b4e2` | Sunday 05:00 UTC |

## New Schedule Matrix

All schedules belong to `gh/andrewtryder/snhu-tools` targeting branch `integration/snhu-tools`:

| Domain | Schedule Name | Schedule ID | Timing | Attribution Actor |
|---|---|---|---|---|
| Courses | `weekly-snhu-tools-course-catalog-sync` | `6cf5efbb-3667-4dc6-9ca0-98d4166f8297` | Sunday 03:00 UTC | `system` |
| Transfers | `weekly-snhu-tools-transfer-sync` | `66879277-4ead-4016-8b5d-7108a82eccd9` | Sunday 04:00 UTC | `system` |
| Programs | `weekly-snhu-tools-program-catalog-sync` | `46199131-e80f-4ec9-b217-aa58105fd60b` | Sunday 05:00 UTC | `system` |

## New Parameters

- **Courses**: `branch = "integration/snhu-tools"`, `run_course_sync = true` (other workflows default `false`)
- **Transfers**: `branch = "integration/snhu-tools"`, `run_transfer_sync = true` (other workflows default `false`)
- **Programs**: `branch = "integration/snhu-tools"`, `run_program_sync = true` (other workflows default `false`)

## Handoff Sequence

1. **Courses Handoff**:
   - Legacy schedule `baa8574f-3f0d-46b0-be55-53ae3d6279c9` deleted.
   - New schedule `6cf5efbb-3667-4dc6-9ca0-98d4166f8297` created on `snhu-tools`.
   - Verified active and correctly parameterized.
2. **Transfers Handoff**:
   - Legacy schedule `9541ae9d-82cf-4209-afb2-23a5cd70ea5b` deleted.
   - New schedule `66879277-4ead-4016-8b5d-7108a82eccd9` created on `snhu-tools`.
   - Verified active and correctly parameterized.
3. **Programs Handoff**:
   - Legacy schedule `fa9230fe-13ce-4ecb-ae32-1ed8cd49b4e2` deleted.
   - New schedule `46199131-e80f-4ec9-b217-aa58105fd60b` created on `snhu-tools`.
   - Verified active and correctly parameterized.

## Verification

- `snhu-tools` schedules count: **3** (Courses, Transfers, Programs).
- Legacy projects schedules count: **0** across `snhu-courses`, `snhu-transfers`, and `snhu-degreemap`.
- Zero manual writer runs were triggered during this handoff; the schedules will execute on their natural weekly cadence.

## Context Safety

- **Legacy Contexts Retained**:
  - `snhu-degreemap-sync-context` intact
  - `snhu-courses-sync` intact
  - `snhu-transfers-sync` intact
- **New Contexts Unchanged**:
  - `snhu-tools-program-sync` intact
  - `snhu-tools-course-sync` intact
  - `snhu-tools-transfer-sync` intact

## Rollback

If an operational defect emerges with automated writers on `snhu-tools` during the 7-day stabilization period:
1. Delete the affected schedule on `snhu-tools` via `DELETE /api/v2/schedule/{schedule_id}`.
2. Recreate the legacy schedule on the corresponding legacy project using the historical parameters and timetable from the Pre-Cutover Schedule Matrix.
3. Legacy contexts and database instances remain untouched and operational for immediate fallback.

## Production Safety

- Production application (`https://snhu-tools.vercel.app`) verified active with HTTP 200 responses across `/`, `/programs`, `/courses`, and `/transfers`.
- Zero application or database connectivity errors logged during or after schedule mutation.

## Stabilization

- A **7-day stabilization period** remains in effect.
- Legacy projects, repositories, contexts, and databases are preserved intact.

## Next Scheduled Writer Cycle

Upcoming scheduled executions (UTC):
- **Courses**: Sunday, September 6, 2026 at 03:00 UTC (`2026-09-06T03:00:00Z`)
- **Transfers**: Sunday, September 6, 2026 at 04:00 UTC (`2026-09-06T04:00:00Z`)
- **Programs**: Sunday, September 6, 2026 at 05:00 UTC (`2026-09-06T05:00:00Z`)

## Recommendation

Writer schedule authority has fully and cleanly transitioned to `snhu-tools`. All 3 legacy recurring schedules have been deleted. `snhu-tools` is now the sole recurring background catalog synchronization authority.
