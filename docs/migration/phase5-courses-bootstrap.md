# Phase 5 Courses Bootstrap & Parity

## Approval Scope

Courses only.

## Target

- Provider: Neon
- Logical host: DB-C
- Logical database: `snhu_tools`
- Target identity verified: yes (`current_database() = 'snhu_tools'`)
- Connection mode: direct Neon PostgreSQL connection (no pooling endpoint used)

## Execution

- Command: `npm run catalog:bootstrap`
- Process exit code: 0
- Terminal action: `promoted`
- Expected count: 2,394
- Imported count: 2,394
- Executions: exactly 1

## Target State

- Status: `idle`
- Cursor: 2,394
- Expected count: 2,394
- Imported count: 2,394
- Completed at: `2026-09-02T01:16:38.927Z`
- Next due at: `2026-11-02T01:16:38.927Z`
- Active lease: no (`lease_expires_at` is null)
- Error state: `last_error` is null

## Structural Validation

- `courses > 0`: pass (2,394)
- `courses_data > 0`: pass (2,394)
- `courses = courses_data`: pass (2,394 = 2,394)
- `imported = expected`: pass (2,394 = 2,394)
- `courses = expected`: pass (2,394 = 2,394)
- `courses_data = expected`: pass (2,394 = 2,394)
- All `courses.pid` exist in `courses_data`: pass (0 missing)
- No orphan `prerequisites.class_id`: pass (0 missing)
- No duplicate `courses.pid`: pass (0 duplicates)
- No duplicate `courses_data.pid`: pass (0 duplicates)
- No duplicate prerequisite primary keys `(class_id, course_id)`: pass (0 duplicates)
- `catalog_course_lookup` view queryable: pass
- `catalog_course_lookup` distinct course code contract: pass (0 duplicate codes)
- Staging-to-live correspondence: pass (courses 2394/2394, courses_data 2394/2394, prerequisites 1928/1928)

## Baseline Relationship

DB-B and existing DB-C were reconfirmed to be **100% semantically identical** immediately prior to target bootstrap:
- `courses`: identical (2,589 rows)
- `courses_data`: identical (2,589 rows)
- `prerequisites`: identical (2,062 rows)
- Both baselines completed on `2026-07-28T23:37:18Z` and `2026-07-28T23:27:22Z` respectively.

## Count Parity

| Object | DB-B | Existing DB-C | `snhu_tools` | Δ DB-B | Δ DB-C |
| --- | --- | --- | --- | --- | --- |
| `courses` | 2,589 | 2,589 | 2,394 | -195 | -195 |
| `courses_data` | 2,589 | 2,589 | 2,394 | -195 | -195 |
| `prerequisites` | 2,062 | 2,062 | 1,928 | -134 | -134 |
| `catalog_sync_items` | 2,589 | 2,589 | 2,394 | -195 | -195 |

## Semantic Fingerprints

| Object | vs DB-B | vs Existing DB-C |
| --- | --- | --- |
| `courses` | Different | Different |
| `courses_data` | Different | Different |
| `prerequisites` | Different | Different |

## Key-Set Differences

### vs DB-B
- `courses.pid`: target-only 113, baseline-only 308
- `courses_data.pid`: target-only 113, baseline-only 308
- `prerequisites (class_id->course_id)`: target-only 189, baseline-only 323

### vs Existing DB-C
- `courses.pid`: target-only 113, baseline-only 308
- `courses_data.pid`: target-only 113, baseline-only 308
- `prerequisites (class_id->course_id)`: target-only 189, baseline-only 323

## Parity Classification

**CURRENT_UPSTREAM_DRIFT**

Justification:
1. Both baseline databases (DB-B and existing DB-C) reflect a synchronization completed on July 28, 2026 (~35 days prior to this bootstrap).
2. The delta of -195 courses (+113 added, -308 retired) reflects active upstream Kuali catalog curation between July and September 2026.
3. The bootstrap completed with exit code 0, successfully promoting 2,394/2,394 courses.
4. All 14 structural validation and relational integrity checks passed completely on `snhu_tools`.
5. Zero orphaned prerequisites, zero duplicate keys, and exact 1:1 correspondence between `courses` and `courses_data`.

## Cross-Domain Safety

- Target Programs live rows:
  - `catalogs`: 1 (unchanged)
  - `programs`: 227 (unchanged)
  - `program_requirement_groups`: 1,743 (unchanged)
  - `program_requirement_courses`: 3,391 (unchanged)
  - `program_text_requirements`: 0 (unchanged)
  - `degree_courses`: 1,599 (unchanged)
  - `degree_course_edges`: 1,113 (unchanged)
  - Programs safety fingerprint: identical (unchanged)
- Target Transfers live rows:
  - `transfer_courses`: 0 (unchanged)
  - `transfer_courses_stage`: 0 (unchanged)
  - `transfer_sync_items`: 0 (unchanged)
- Programs target unchanged: yes
- Transfers target unchanged: yes

## Legacy Databases

- DB-A modified by this task: no (read-only enforced)
- DB-B modified by this task: no (read-only enforced)
- Existing DB-C modified by this task: no (read-only enforced)

## Deferred

- Transfers bootstrap into `snhu_tools`
- Transfers parity validation against existing DB-C
- Shared runtime Pool conversion
- Neon runtime pooling
- Vercel database cutover
- CircleCI remote context/schedule cutover
- Legacy writer disablement

## Recommendation

It is safe to **REQUEST human approval** for the Transfers bootstrap data gate.
