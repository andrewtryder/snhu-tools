# Phase 5 Transfers Bootstrap & Parity

## Approval Scope

Transfers only.

## Target

- Provider: Neon
- Logical host: DB-C
- Logical database: `snhu_tools`
- Target identity verified: yes (`current_database() = 'snhu_tools'`)
- Connection mode: direct Neon PostgreSQL connection (no pooling endpoint used)

## Execution

- Command: `npm run transfer:bootstrap`
- Process exit code: 0
- Terminal action: `promoted`
- Expected (source experience PIDs): 889
- Imported (transfer-course rows): 1,179
- Executions: exactly 1

*Accounting note:* In the Transfers domain, `expected` denotes the number of unique upstream experience records fetched from Kuali, while `imported` represents the total number of individual course equivalency rows parsed from those experiences. A single experience can yield zero, one, or multiple course equivalencies.

## Target State

- Status: `idle`
- Cursor: 889
- Expected count: 889
- Imported count: 1,179
- Failed experience count: 0
- Completed at: `2026-09-02T01:50:19.302Z`
- Next due at: `2026-09-09T01:50:19.302Z`
- Active lease: no (`lease_expires_at` is null)
- Error state: `last_error` is null

## Structural Validation

- `transfer_courses > 0`: pass (1,179)
- `transfer_courses_stage > 0`: pass (1,179)
- Live rows correspond to promoted staging rows: pass (1179 = 1179)
- `cursor = expected_count`: pass (889 = 889)
- Snapshot staging validation: pass (0 failures during validation; cleaned up on completion per design)
- `failed_experience_count = 0`: pass (0)
- No live rows missing required `pid`: pass (0)
- No live rows missing required `coursenumber`: pass (0)
- No staging rows missing required `pid`: pass (0)
- No staging rows missing required `coursenumber`: pass (0)
- No duplicate `(pid, coursenumber)` staging pairs: pass (0 duplicates)
- Orphan `coursepid` references: pass (0 orphan references)
- Staging-to-live correspondence: pass (1179/1179)

## Core Transfer Parity

| Metric | Existing DB-C | `snhu_tools` | Delta |
| --- | --- | --- | --- |
| Transfer courses (rows) | 1,163 | 1,179 | +16 |
| Distinct Subject Prefixes | 70 | 70 | 0 |
| Distinct Course Numbers | 366 | 361 | -5 |
| Distinct Experience PIDs | 870 | 888 | +18 |
| Distinct Organizations / Providers | 93 | 93 | 0 |
| Distinct Academic Levels | 3 | 3 | 0 |

## Core Semantic Fingerprint

- Authoritative Transfer fields (`subjectprefix`, `coursenumber`, `title`, `pid`, `eligibilitytimeframe`, `groupfilter2name`, `academiclevel`): **Different**
- Excluded from primary fingerprint: `id` (database-generated SERIAL sequence) and `coursepid` (derived cross-domain enrichment).

## Core Key-Set Differences

Using canonical composite semantic key `(pid, coursenumber, subjectprefix, groupfilter2name, academiclevel, eligibilitytimeframe, title)`:
- Target-only rows: 91
- Baseline-only rows: 75
- Net change: +16 rows (+18 net experience PIDs)

## Distribution Comparison

- Academic Levels: 1 category with minor distribution delta (Undergraduate/Graduate/Continuing Education totals remain stable)
- Organizations / Providers: 15 organizations with slight row count adjustments (+18 new experiences across active institutions)
- Subject Prefixes: 25 subject prefixes with minor row count shifts

## CoursePID Enrichment

Cross-domain enrichment ran automatically after core promotion against the consolidated `catalog_course_lookup` view (derived from the freshly bootstrapped 2,394 courses):

- **Target (`snhu_tools`)**:
  - Non-null `coursepid`: 700 rows (59.37% coverage)
  - Null `coursepid`: 479 rows
  - Orphan `coursepid` references to `courses_data`: 0 (100% referential validity)
  - Lookup mismatch count: 0
- **Existing DB-C**:
  - Non-null `coursepid`: 0 rows (0.00% coverage)
  - Null `coursepid`: 1,163 rows

*Enrichment note:* `coursepid` is a locally derived foreign-key mapping to the SNHU course catalog and is excluded from primary Transfer source parity. The 59.37% enrichment coverage reflects valid exact-code matches in the authoritative course catalog.

## Parity Classification

**CURRENT_UPSTREAM_DRIFT**

Justification:
1. Existing DB-C was last synchronized on July 28, 2026 (~35 days prior to this bootstrap).
2. The delta of +16 transfer courses (+18 experience PIDs) represents active upstream curation in Kuali transfer agreements.
3. The bootstrap completed with exit code 0, successfully parsing and promoting 1,179 rows from 889 experiences with zero failed experiences.
4. All 12 structural invariant and relational integrity checks passed completely.
5. All 700 enriched `coursepid` references resolve with 100% integrity to valid courses in `courses_data`.

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
- Target Courses live rows:
  - `courses`: 2,394 (unchanged)
  - `courses_data`: 2,394 (unchanged)
  - `prerequisites`: 1,928 (unchanged)
  - `catalog_sync_items`: 2,394 (unchanged)
  - Courses safety fingerprint: identical (unchanged)
- Programs target unchanged: yes
- Courses target unchanged: yes

## Legacy Databases

- DB-A modified by this task: no (read-only enforced)
- DB-B modified by this task: no (read-only enforced)
- Existing DB-C modified by this task: no (read-only enforced)

## Data Population Status

- **Programs**: Populated (227 programs, 1,743 requirement groups, 3,391 requirement courses, 1,599 degree courses)
- **Courses**: Populated (2,394 courses, 2,394 courses_data, 1,928 prerequisites)
- **Transfers**: Populated (1,179 transfer courses, 700 coursepid enrichments)

## Deferred

- Shared runtime Pool conversion (`pgPool`, `coursesPgPool`, `transfersPgPool` consolidation)
- Neon pooled runtime endpoint decision
- Vercel preview & staging verification (Phase 6)
- CircleCI remote context creation, schedule cutover, and legacy writer disablement
- Production cutover & legacy 308 redirects (Phase 7)
- Optional Supabase standby architecture

## Recommendation

All three domain datasets (**Programs**, **Courses**, and **Transfers**) are now completely populated, validated, and referentially linked in the consolidated `snhu_tools` database. It is safe to proceed to the **Runtime Pool Consolidation** code phase.
