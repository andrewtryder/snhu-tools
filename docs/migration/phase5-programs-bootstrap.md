# Phase 5 Programs Bootstrap & Parity

## Approval Scope

Programs only.

## Target

- Provider: Neon
- Logical host: DB-C
- Logical database: `snhu_tools`
- Target identity verified: yes (`current_database() = 'snhu_tools'`)
- Connection mode: direct Neon PostgreSQL connection (no pooling endpoint used)

## Execution

- Domain writer: `runProgramSync({ forceBootstrap: true })`
- Script wrapper: direct invocation of domain writer (bypassed `scripts/program-bootstrap.ts` to prevent redundant migration execution)
- Executions: exactly 1
- Terminal action: `promoted`
- Sync status: `idle`
- Promoted: `true`
- Expected count: 227
- Imported count: 227
- Skipped count: 0
- Failed count: 0

## Target State

- Sync ID: `474698c1-8fba-4386-923a-0f531a2e5f36`
- Status: `idle`
- Cursor: 227
- Expected count: 227
- Imported count: 227
- Skipped count: 0
- Failed count: 0
- Completed at: `2026-09-02T00:31:37.286Z`
- Next due at: `2026-09-09T00:31:37.218Z`
- Active lease: no (`lease_expires_at` is null)
- Error state: `last_error` is null

## Structural Validation

- `programs > 0`: pass (227)
- Duplicate program slugs: 0 (pass)
- Orphaned requirement groups: 0 (pass)
- Orphaned requirement courses: 0 (pass)
- Invalid parent requirement groups: 0 (pass)
- Duplicate `degree_courses.course_code`: 0 (pass)
- Duplicate `degree_course_edges` primary keys: 0 (pass)
- Accounting match (`imported + skipped + failed = expected`): pass (227 = 227)
- Failed count zero: pass (0)
- Live and staging correspondence: pass (programs 227/227, degree_courses 1599/1599)

## DB-A Parity

| Object | DB-A Count | `snhu_tools` Count | Delta | Semantic Fingerprint |
| --- | --- | --- | --- | --- |
| `catalogs` | 2 | 1 | -1 | Identical (canonical catalog `cat_6349a3f9164d00001c6c80da`) |
| `programs` | 227 | 227 | 0 | Identical |
| `program_requirement_groups` | 1,743 | 1,743 | 0 | Identical |
| `program_requirement_courses` | 3,391 | 3,391 | 0 | Identical |
| `program_text_requirements` | 0 | 0 | 0 | Identical |
| `degree_courses` | 1,599 | 1,599 | 0 | Identical |
| `degree_course_edges` | 1,299 | 1,113 | -186 | Different |
| `program_sync_items` | 3,740 | 227 | -3,513 | N/A (run-specific snapshot) |

Note on `catalogs`: DB-A contained 2 catalog rows due to a historical legacy artifact; the canonical active catalog definition in `snhu_tools` has identical semantic fields to the canonical DB-A row.

Note on `program_sync_items`: DB-A accumulated sync items across historical runs; `snhu_tools` contains the exact 227 items snapshot corresponding to the active bootstrap run.

## Key-Set Differences

### Programs
- target-only: 0
- DB-A-only: 0

### Degree Courses
- target-only: 0
- DB-A-only: 0

### Degree Edges
- target-only: 0
- DB-A-only: 186

## Parity Classification

**CURRENT_UPSTREAM_DRIFT**

Justification:
1. All 227 programs, 1,743 requirement groups, 3,391 requirement courses, and 1,599 degree courses exhibit 100% exact semantic fingerprint equality and zero key-set differences between DB-A and `snhu_tools`.
2. DB-A was completed on `2026-08-23T05:02:09Z` (10 days prior to this bootstrap).
3. The delta of 186 degree course edges reflects newer upstream Kuali catalog prerequisite details fetched during live execution.
4. Target staging validation passed all regression and integrity checks (edge count ratio 85.7% exceeds the 80% regression threshold).
5. Zero failed programs, zero skipped programs, and zero structural invariant violations.

## Cross-Domain Safety

- `courses` live rows: 0 (unchanged)
- `courses_data` live rows: 0 (unchanged)
- `prerequisites` live rows: 0 (unchanged)
- `catalog_sync_items` live rows: 0 (unchanged)
- `transfer_courses` live rows: 0 (unchanged)
- `transfer_sync_items` live rows: 0 (unchanged)
- Courses target state/data unchanged: yes
- Transfers target state/data unchanged: yes

## Legacy Databases

- DB-A modified by this task: no (read-only enforced)
- DB-B modified by this task: no
- Existing DB-C database modified by this task: no

## Deferred

- Courses bootstrap into `snhu_tools`
- Transfers bootstrap into `snhu_tools`
- Shared runtime Pool conversion
- Neon pooled runtime endpoint activation
- Vercel production cutover
- CircleCI remote context creation, schedule cutover, and legacy writer disablement

## Recommendation

It is safe to **REQUEST human approval** for the Courses bootstrap data gate.
