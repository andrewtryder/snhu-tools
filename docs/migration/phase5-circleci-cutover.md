# Phase 5 CircleCI Cutover

## Current State

- Unified configuration exists locally; its three writer workflows are opt-in and default off.
- New contexts and schedules have not been created; legacy contexts and schedules remain untouched.
- The authoritative PostgreSQL target remains approval-gated.

## Pipeline Parameters

`run_program_sync`, `run_course_sync`, and `run_transfer_sync` are boolean pipeline parameters, each defaulting to `false`. During initial consolidated-database rollout, set only one parameter per pipeline invocation to avoid overlapping migrations and writes.

## New Contexts

- `snhu-tools-program-sync`
- `snhu-tools-course-sync`
- `snhu-tools-transfer-sync`

## Environment Variable Matrix

| Variable | Program context | Course context | Transfer context | Purpose | Required/optional |
| --- | --- | --- | --- | --- | --- |
| `POSTGRES_URL` | yes | yes | yes | Approved consolidated writer connection | required |
| `POSTGRES_CA_CERT` | yes | yes | yes | TLS CA certificate when required by the selected provider | optional |
| `SITE_URL` | yes | yes | yes | Scoped revalidation endpoint base URL | required |
| `REVALIDATE_SECRET` | yes | yes | yes | Bearer authorization for revalidation | required |
| `HONEYBADGER_API_KEY` | yes | yes | yes | Server-side writer error reporting | optional |
| `KUALI_CATALOG_YEAR_LABEL` | yes | no | no | Programs catalog selection | required |

The writer jobs do not use `COURSES_POSTGRES_URL`, `COURSES_POSTGRES_CA_CERT`, `TRANSFERS_POSTGRES_URL`, or `TRANSFERS_POSTGRES_CA_CERT`.

## Scoped Revalidation

- Programs: `scope=programs`
- Courses: `scope=courses`
- Transfers: `scope=transfers`

## Manual Validation Before Activation

- An approved target database is selected.
- Migrations and bootstrap are completed and validated.
- The snhu-tools production or preview `SITE_URL` is determined.
- `REVALIDATE_SECRET` is configured.
- Context variable names are verified.
- Pipelines are tested manually with one parameter at a time.

## Scheduling Rules

- One feature parameter per scheduled trigger.
- Jobs are staggered and non-overlapping where practical.
- The target branch requires human approval.
- Exact schedule times remain unknown until separately established.

## Rollback

- Legacy contexts remain unchanged.
- Legacy schedules are disabled, not destroyed, initially.
- New schedules can be disabled and old schedules re-enabled.
- Old databases remain preserved during stabilization.

## Remote Actions Still Requiring Approval

- Create and populate the new contexts.
- Select target database values.
- Create new scheduled triggers.
- Disable legacy scheduled triggers.
- Enable new writers.
