# Phase 5 Database & CircleCI Consolidation Plan

## Executive Summary

Phase 5 must be executed as a sequence of separately approved changes. The source migration audit found no physical object-name collisions across Programs, Courses, and Transfers. Each dataset is reproducible from SNHU Kuali upstream data through its existing migration plus bootstrap/sync pipeline. That makes a fresh bootstrap into one approved database technically viable and preferable to copying rows, subject to parity validation.

The recommended target architecture is one PostgreSQL database in the `public` schema, one shared runtime `pg.Pool` (`max: 1`) per Vercel function instance, and modular domain code. The recommended operational transition uses three new feature-specific CircleCI contexts rather than repurposing legacy contexts. The authoritative target database cannot be selected from source evidence alone and requires human approval.

This document is a plan only. It authorizes no database, Vercel, CircleCI, or production-environment change.

## Verified Repository Baselines

| Repository | SHA | Working tree |
| --- | --- | --- |
| `snhu-tools` | `04ad3d099fe0f2a280bedb725380b194d542e0ed` | clean |
| `snhu-degreemap` | `2600c316caef72329be7db0950f9d47201eacefd` | clean |
| `snhu-courses` | `5fdf3b44d27496a8cbb1cdf1609190584890844f` | clean |
| `snhu-transfers` | `db1024b6e4a69c963126ed848318bc5817b2c94b` | clean |

## Current Runtime Database Topology

| Domain | Runtime environment | Global runtime object | Pool maximum |
| --- | --- | --- | --- |
| Programs / Degree Map | `POSTGRES_URL`, `POSTGRES_CA_CERT` | `globalThis.pgPool` | 1 |
| Courses | `COURSES_POSTGRES_URL`, `COURSES_POSTGRES_CA_CERT` | `globalThis.coursesPgPool` | 1 |
| Transfers | `TRANSFERS_POSTGRES_URL`, `TRANSFERS_POSTGRES_CA_CERT` | `globalThis.transfersPgPool`, lazy `globalThis.transfersDrizzleDb` | 1 |

Each pool is lazy, but an active Vercel instance serving all three domains can establish up to three database sessions. This temporary three-pool runtime topology is deliberately isolated; it is not the desired final topology.

## Current Live Database Topology

Unknown. No credentials were read, parsed, or used for live metadata inspection during this audit. Therefore the following facts require approved read-only inspection before a target is selected: whether any current domains use the same endpoint, database, or role; capacity; active session count; database size; and current table inventory.

## Schema & Migration Compatibility

All inspected migrations use idempotent `CREATE ... IF NOT EXISTS`, additive alterations where needed, and initialization rows. No extensions, user-defined sequences, triggers, or non-public-schema objects were declared by the three migration implementations. `SERIAL` on `transfer_courses.id` creates PostgreSQL's implicit owned sequence. No views exist outside the Courses `catalog_course_lookup` view.

| Domain | Object name | Object type | Live/staging/state | Foreign-key dependencies | Potential collision | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Programs | `catalogs` | table | live | none | none | Program catalog metadata |
| Programs | `programs`, `programs_stage` | tables | live/staging | `catalogs` | none | unique `(catalog_id, source_pid)` and `(catalog_id, slug)` |
| Programs | `program_requirement_groups`, `_stage` | tables | live/staging | self-reference; respective `programs` table | none | cascade deletes; unique `(program_id, source_path)` |
| Programs | `program_requirement_courses`, `_stage` | tables | live/staging | respective requirement groups | none | cascade deletes |
| Programs | `program_text_requirements`, `_stage` | tables | live/staging | respective requirement groups | none | cascade deletes |
| Programs | `degree_courses`, `_stage` | tables | live/staging | none | none | primary key `course_code` |
| Programs | `degree_course_edges`, `_stage` | tables | live/staging | logical course-code relationship | none | three-column primary key |
| Programs | `program_sync_state` | table | state | none | none | initialized `program_sync`; lease and counters |
| Programs | `program_sync_items` | table | state/snapshot | none | none | primary key `(sync_id, ordinal)`; unique `(sync_id, source_pid)` |
| Programs | `programs_*_idx`, `program_req_*_idx`, `degree_edges_*_idx` | indexes | live/staging as defined | n/a | none | slug/title/course/group/edge lookup indexes |
| Courses | `courses`, `courses_stage` | tables | live/staging | none | none | Kuali list records; primary key `pid` |
| Courses | `courses_data`, `courses_data_stage` | tables | live/staging | none | none | detail records; primary key `pid` |
| Courses | `prerequisites`, `prerequisites_stage` | tables | live/staging | respective `courses_data` table | none | primary key `(class_id, course_id)`, cascade on parent delete |
| Courses | `catalog_sync_state` | table | state | none | none | initialized `catalog`; lease, cursor, and counters |
| Courses | `catalog_sync_items` | table | state/snapshot | none | none | primary key `(sync_id, ordinal)`; unique `(sync_id, pid)` |
| Courses | `catalog_course_lookup` | view | live | `courses_data` | none | distinct `catalog_course_id` lookup; intentionally useful to Transfers |
| Courses | `courses_data_*`, `prerequisites_*` indexes | indexes | live/staging | n/a | none | course-id and prerequisite lookup indexes |
| Transfers | `transfer_courses`, `transfer_courses_stage` | tables | live/staging | none | none | `id SERIAL` primary key; stage requires `pid`, `coursenumber` |
| Transfers | implicit `transfer_courses_id_seq`, `_stage_id_seq` | sequences | live/staging | owned by serial columns | none | PostgreSQL-generated implicit sequences |
| Transfers | `transfer_sync_state` | table | state | none | none | initialized `transfer`; lease, cursor, errors, counters |
| Transfers | `transfer_sync_items` | table | state/snapshot | none | none | primary key `(sync_id, ordinal)`; unique `(sync_id, pid)` |
| Transfers | `transfer_courses_stage_pid_coursenumber_uidx` | unique index | staging | n/a | none | deduplicates experience/course mappings |
| Transfers | `transfer_courses_*_idx` | indexes | live | n/a | none | subject, course, organization, level, and composite subject/course lookup |

The migrations have no table, index, view, state-table, or explicit constraint-name collisions. Semantically similar but deliberately distinct concepts include Programs `degree_courses`, Courses `courses`/`courses_data`, and Transfers `transfer_courses`; their distinct structures should not be renamed merely for uniformity. All state tables use distinct names and distinct fixed IDs.

The single cross-domain dependency is optional: Transfers promotion attempts to update `transfer_courses.coursepid` from the Courses `catalog_course_lookup` view. It catches an unavailable-view error, so current independent databases operate safely; a unified database makes that enrichment available. This must be tested after unified migration ordering places Courses before Transfers promotion.

## Data Reproducibility

| Domain | Upstream source | Bootstrap and refresh | Staging/promotion | Fresh state viable? | Finding |
| --- | --- | --- | --- | --- | --- |
| Programs | SNHU Kuali program and course APIs | `program:bootstrap` runs migrations then `runProgramSync({ forceBootstrap: true })`; `program:sync` refreshes catalog data | snapshot IDs, populate stage, validate counts/relations/shrink, transactional truncate-and-copy promotion | yes | No legacy-only authoritative rows identified; sync state may start fresh |
| Courses | SNHU Kuali courses API | `catalog:bootstrap`; `catalog:sync` runs batches to completion | snapshot PIDs, populate three stage tables, validate, transactional truncate-and-copy promotion | yes | No legacy-only authoritative rows identified; sync state may start fresh |
| Transfers | SNHU Kuali experiences API | `transfer:bootstrap`; `transfer:sync` runs batches to completion | snapshot experience PIDs, populate stage, validate including 75% shrink guard, transactional truncate-and-copy promotion | yes | No legacy-only authoritative rows identified; sync state may start fresh |

Recommendation: use a fresh bootstrap, not database-to-database copying, after the target database and migration execution are explicitly approved. Historical sync IDs, cursors, and timestamps are operational history rather than authoritative source data; they can start fresh. Preserve old databases for validation and rollback.

## Current Connection Capacity

Live server limits, reserved slots, active sessions, sizes, and approximate row/table counts are unknown because no database credentials were inspected. Before any write cutover, perform approved read-only metadata queries in read-only transactions and record only aggregate facts.

At the application level, the theoretical per-active-instance runtime change is 3 sessions today (one pool per domain, each `max: 1`) to 1 after consolidation (one shared pool, `max: 1`): a maximum reduction of 2 sessions, or approximately 67%, per instance when all domains are active. Multiple Vercel instances still create multiple sessions; migrations and sync jobs add direct-client sessions; consolidation does not provide PgBouncer or global serverless pooling; database `max_connections` remains a hard constraint.

## Target Database Options

| Option | Vercel connection count | Migration/sync complexity | Collision/rollback/operations | Assessment |
| --- | --- | --- | --- | --- |
| A: one service, one database, `public`, one pool | 1 per active instance | one deterministic orchestrator; domain modules remain separate | collision audit is clean; simplest backup/restore and runtime model | recommended pending target approval |
| B: one service, multiple databases, multiple pools | remains up to 3 | retains separate migrations and endpoints | preserves isolation but little runtime connection benefit | not preferred |
| C: one database, schemas per domain, one pool | 1 | requires schema-qualified migrations/queries and Drizzle configuration review | stronger namespace isolation but higher code and migration complexity | viable only if human governance requires it |
| D: three independent databases/pools | remains up to 3 | no consolidation work | highest runtime/configuration burden | current temporary state, not target |

## Recommended Database Topology

Recommend Option A: one approved PostgreSQL service, one approved database, `public` namespace, all audited domain tables, and one shared runtime pool. The no-collision audit, existing optional lookup integration, and independent state/lease rows support this technically. A domain's promotion truncates only its own live tables; therefore scheduled writers can be sequentially operated against one database without cross-domain data mutation.

## Recommended Authoritative Target

**TARGET DATABASE: REQUIRES HUMAN APPROVAL.**

The audit cannot safely identify which existing database is the best target without non-secret facts: whether each existing database is on the same service; capacity/headroom; backup/restore posture; database size; network/region compatibility; and operational ownership. Choose one generically named existing target only after approved read-only topology inspection. Selection must not be inferred from the Programs UI being primary.

## Single Runtime Pool Design

Future code-only design:

1. Keep `src/lib/db/pool.ts` as the sole lazy shared `getPool()` implementation with `max: 1` and the existing Vercel pool attachment.
2. Move Courses runtime queries from `getCoursesPool()` / `coursesPgPool` to shared `getPool()`, retaining `augmentQueryClient` only as an adapter around a checked-out shared-pool client.
3. Remove Transfers `transfersPgPool`; retain its lazy Proxy Drizzle pattern but construct Drizzle with `drizzle(getPool(), { schema })` only at request time.
4. Delete feature-specific runtime pool modules only after all call sites and tests use the shared pool and production configuration has cut over.

Drizzle's node-postgres adapter accepts a `pg.Pool`; therefore wrapping the same shared pool is technically compatible. The lazy proxy is still required so `next build` does not need a connection string or instantiate a pool. The design must be validated with pool identity, build-safety, and Transfers query tests.

## Final Environment Variable Model

Final runtime and write-job direction: `POSTGRES_URL` and `POSTGRES_CA_CERT` only. Do not retire `COURSES_POSTGRES_URL`, `COURSES_POSTGRES_CA_CERT`, `TRANSFERS_POSTGRES_URL`, or `TRANSFERS_POSTGRES_CA_CERT` until all of these are complete: target migration and bootstrap approved/executed; parity checks pass; preview/runtime validation passes; new writers run successfully; rollback window closes; and human approval explicitly authorizes retirement. Legacy variables remain necessary for immediate rollback until then.

## Migration Code Architecture

Port/retain independently understandable domain migration modules under `scripts/migrations/programs.ts`, `courses.ts`, and `transfers.ts`, orchestrated by one `scripts/migrate.ts`. Use one explicit `pg.Client` and execute the three domain migration functions sequentially in deterministic order: Programs, Courses, Transfers. This is preferred over three clients because it uses one connection, fails one command on any migration failure, and ensures `catalog_course_lookup` exists before any later Transfers bootstrap/promotion.

Each function must preserve idempotence and domain-specific statements. Migration transaction boundaries need deliberate design: source Programs is transactional; Courses and Transfers currently are not globally transactional. The port must not pretend all source migrations are atomic without testing PostgreSQL DDL behavior and deciding scope. No simultaneous independent migration connections are required.

## Write/Sync Pipeline Port Inventory

| Domain | Files | Classification | Notes |
| --- | --- | --- | --- |
| Programs | `scripts/migrate.ts`, `scripts/program-bootstrap.ts`, `scripts/program-sync.ts`, `scripts/validate-sync-result.mjs` | already exists in snhu-tools | retain; later adapt unified migration orchestration only |
| Programs | `src/lib/db/client.ts`, `ssl.ts`, `pool.ts`; `src/lib/program-sync/{database,fetch,index,parse,persist,promote,types}.ts`; `src/config/kualiConfig.ts` | already exists in snhu-tools | preserve domain behavior; adapt only shared-client boundary when approved |
| Courses | `scripts/load-env.ts`, `migrate.ts`, `catalog-bootstrap.ts`, `catalog-sync.ts` | port with environment/path adaptations | source scripts assume `POSTGRES_URL`; use unified script paths without sourcing legacy dotenv unexpectedly |
| Courses | `src/lib/db/{client,pool,sql,ssl,types}.ts`; `src/lib/catalog-sync/{database,fetch,index,parse,persist,promote}.ts` | port with environment/path adaptations / needs merge | merge shared DB/TLS adapters with existing tools adapters; retain catalog domain modules and tests |
| Transfers | `scripts/migrate.ts`, `transfer-bootstrap.ts`, `transfer-sync.ts`, `validate-transfer-sync-result.mjs`, `verify-transfer-coverage-api.mjs` | port with environment/path adaptations | retain structured validator; decide whether API verifier remains CI smoke validation |
| Transfers | `src/db/{client,index,pool,schema,ssl}.ts`; `src/lib/transfer-sync/{fetch,index,parse,persist,promote}.ts` | partially already exists / needs merge | runtime schema and lazy Drizzle already exist; port write sync modules and merge client/pool handling into shared implementation |
| All | source test files adjacent to migrations, pools, persist/promote, sync scripts | port with corresponding code | required to preserve contracts; do not weaken validation |

## Proposed npm Scripts

Keep existing Programs scripts and add the source-compatible commands: `db:migrate` (unified orchestrator), `program:bootstrap`, `program:sync`, `catalog:bootstrap`, `catalog:sync`, `transfer:bootstrap`, and `transfer:sync`. Also port the existing validators as explicit internal/CI commands rather than hiding validation in shell `grep`. Preserve source command names because existing CircleCI and operational documentation use them.

## Current CircleCI Architecture

| Repository | Parameters / workflow | Image and cache | Migration, validation, revalidation | Context and branch |
| --- | --- | --- | --- | --- |
| Degree Map | `run_program_sync=false`; `catalog_sync_workflow` conditional | `cimg/node:24.0.0`; npm cache | migrate; structured sync JSON capture, validator, artifacts; revalidate only `promoted` | `snhu-degreemap-sync-context`; parameterized workflow, no branch filter in config |
| Courses | `scheduled-catalog-sync`, no pipeline parameter declared | `cimg/node:24.13`; npm cache | migrate; sync output logged; `grep '"action":"promoted"'`; no preserved artifacts | `snhu-courses-sync`; `master` only |
| Transfers | `run_transfer_sync=false`; conditional workflow | `cimg/node:24.13`; npm cache | migrate; structured sync JSON capture, validator, artifacts; revalidate only `promoted` | `snhu-transfers-sync`; `master` only |

Source configuration does not reveal externally configured schedule timing. **CURRENT REMOTE SCHEDULE: UNKNOWN.** No CircleCI remote inspection was performed because the source audit supplies the required planning evidence without accessing remote infrastructure.

## Proposed CircleCI Architecture

Use one snhu-tools config with three independently parameterized jobs: `run_program_sync`, `run_course_sync`, and `run_transfer_sync`, all defaulting to `false`. Jobs should be `sync-program-catalog`, `sync-course-catalog`, and `sync-transfer-data`; each checks out, runs `npm ci`, runs the relevant safe idempotent migration entrypoint, runs only its domain sync, performs domain validation, stores useful result artifacts, and reports failure accurately.

Courses should adopt the Programs/Transfers structured capture/validate/report pattern. Its current `grep` check is less diagnostic and does not preserve artifacts. This strengthens Courses validation without weakening Programs or Transfers.

## CircleCI Context Strategy

| Strategy | Benefits | Risk | Recommendation |
| --- | --- | --- | --- |
| Reuse legacy contexts | least new setup | repointing a context while its legacy schedule is active can make an old writer mutate the new target | reject |
| One broad `snhu-tools-sync-context` | fewer contexts | broadest privilege and weak rollback isolation | not preferred |
| Three new feature-specific contexts | least privilege, independent rollback, legacy contexts remain untouched | some secret duplication and setup effort | recommended |

Recommended new contexts: `snhu-tools-program-sync`, `snhu-tools-course-sync`, and `snhu-tools-transfer-sync`. Preserve the three legacy contexts unchanged until the stabilization period ends.

## Schedule & Concurrency Strategy

Current remote schedule timing is unknown. New writers must be scheduled non-overlapping where practical, especially during initial consolidated operation. Do not choose exact times until approved remote timing/duration evidence is available. Domain leases prevent same-domain concurrent work, but they do not coordinate across `program_sync_state`, `catalog_sync_state`, and `transfer_sync_state`; concurrent cross-domain writers should be treated as capacity and operational risk rather than data-conflict-safe by default.

## Scoped Revalidation Calls

After a validated promotion only, the new jobs must use explicit endpoints:

- Programs: `${SITE_URL}/api/revalidate?scope=programs`
- Courses: `${SITE_URL}/api/revalidate?scope=courses`
- Transfers: `${SITE_URL}/api/revalidate?scope=transfers`

Normal scheduled jobs must not use `scope=all` or rely on the backward-compatible no-scope default.

## Data Cutover Runbook

1. Obtain Gate 1 approval and approved read-only target-capacity inspection.
2. Complete code-only port and unified migration work; review it independently.
3. Obtain Gate 2 approval before executing unified migration/bootstrap against the approved target.
4. Bootstrap Courses and Transfers (and Programs if target lacks current Programs data) from upstream; do not copy production rows by default.
5. Run read-only aggregate parity checks against old and target databases.
6. Deploy/preview only after separate approval and validate tools against target.
7. Obtain Gate 5 approval; disable legacy schedules, do not delete them.
8. Obtain Gate 6 approval; enable new feature-specific jobs one at a time and verify promotion plus scoped revalidation.
9. Obtain Gate 7 approval to update snhu-tools runtime environment only after the target is validated.
10. Preserve old databases, contexts, and schedules for a stabilization period; only then seek Gate 8 for temporary-variable retirement.

## Data Parity Validation

Use read-only aggregate checks, not row copies. PASS means target data is freshly synchronized, structurally valid, and counts/quality metrics are consistent with the old domain within explained upstream-refresh differences. FAIL means promotion/runtime cutover stops and the target is investigated without deleting legacy state.

| Domain | Required aggregate checks |
| --- | --- |
| Programs | live/stage program counts; requirement-group/course/text/edge counts; distinct slugs; duplicate-key checks; null/unknown resolution counts; resolved-course rate; sync state successful/idle and timestamp |
| Courses | `courses`, `courses_data`, and prerequisite counts; distinct PIDs and catalog course IDs; lookup-view count; orphan prerequisite count; sync state and latest completion |
| Transfers | live/stage transfer counts; distinct course numbers, PIDs, providers, subjects, organizations, levels; duplicate `(pid, coursenumber)` check; null critical-key count; sync state and latest completion; `coursepid` enrichment coverage where lookup is available |

## Rollback Plan

Keep legacy Vercel applications, databases, contexts, and configuration untouched. Initially disable old schedules rather than deleting them. If new target validation, runtime behavior, or first sync fails, disable the new job/schedule, restore snhu-tools feature-specific database variables if they had been changed, and re-enable only the relevant legacy writer/context. Rollback becomes materially harder once legacy databases or contexts are destroyed; do not schedule destruction until an explicitly approved stabilization period completes.

## Connection-Risk Assessment

One shared pool does reduce competing pool objects and potential per-instance sessions from three to one, simplifies configuration, and makes lifecycle management clearer. It does not globally cap connections across Vercel instances, add PgBouncer, remove Aiven/server `max_connections`, prevent scale-out, or remove database dependence from dynamic requests. Sync and migration direct clients still consume sessions. Connection capacity must be measured before the write cutover.

## Future Materialized/Static Serving Note

Database consolidation is independent of later removal of PostgreSQL from high-volume public request paths. Future candidates for snapshots/materialized serving are Courses catalog/directory data, Transfers facet/directory data, and Programs catalog data. This is not a Phase 5 blocker.

## Implementation Batches

| Batch | Scope | Change class |
| --- | --- | --- |
| Phase 5B | port domain migrations/write pipelines and tests into snhu-tools; no execution | CODE-ONLY |
| Phase 5C | create unified CircleCI config locally with three jobs and scoped endpoints; validate config only | CODE-ONLY |
| Phase 5D | read-only database topology/capacity inspection and select target | READ-ONLY REMOTE + human decision |
| Phase 5E | run unified migration/bootstrap on approved target | DATABASE WRITE |
| Phase 5F | run parity validation and preview/runtime verification | READ-ONLY REMOTE / VERCEL WRITE only if separately approved |
| Phase 5G | consolidate runtime pools and variables in code, retain rollback variables | CODE-ONLY then VERCEL WRITE with approval |
| Phase 5H | create new contexts/schedules, disable legacy schedules, enable jobs gradually | CIRCLECI WRITE |
| Phase 5I | retire temporary variables and legacy infrastructure after stabilization | VERCEL WRITE / CIRCLECI WRITE / DATABASE decision |

## Human Approval Gates

1. Select the authoritative target PostgreSQL database.
2. Approve unified migrations/bootstrap against that target.
3. Approve the final CircleCI context strategy.
4. Approve creation/modification of CircleCI contexts.
5. Approve disabling legacy schedules.
6. Approve enabling new schedules.
7. Approve changing snhu-tools production database environment variables.
8. Approve retirement of feature-specific temporary database variables.

## Risk Register

| Risk | Rating | Mitigation |
| --- | --- | --- |
| Incorrect target database | High | approved topology/capacity inspection and Gate 1 |
| Incomplete migrated schema | High | modular migration tests; blank-target migration review; parity checks |
| Upstream bootstrap cannot reproduce data | High | prove fresh bootstrap and validate aggregates before runtime cutover |
| Duplicate scheduled writers | High | new contexts; disable rather than repurpose legacy schedules; staged enablement |
| Migration concurrency | Medium | one sequential client/orchestrator; approved execution window |
| Connection exhaustion | High | capacity inspection, `max: 1`, stagger writers, preserve rollback |
| Legacy context repointed while old job active | High | never repurpose legacy contexts |
| Incorrect revalidation scope | Medium | per-job explicit scoped endpoint and promotion-only calls |
| Target parity mismatch | High | read-only aggregate PASS/FAIL gates before cutover |
| Rollback drift | Medium | preserve databases, contexts, schedules, and variables through stabilization |
| Write-script environment collision | High | one reviewed final environment model; no implicit legacy dotenv loading |
| Shared pool instantiated during build | High | retain lazy getters/Transfers Proxy and build tests |
| Transfers Drizzle shared-pool regression | Medium | pool-identity, lazy-build, and query regression tests |
| Unexpected cross-domain collision | Medium | execute migration against blank approved target and inspect metadata before bootstrap |

## Unknowns / Required Human Decisions

- Authoritative target database and its capacity/backups/region/ownership facts.
- Whether current databases share endpoints, database names, or roles.
- Current database connection limits, active sessions, sizes, and table statistics.
- Current remote CircleCI schedule timing and actual job durations.
- Exact production context variable-name sets and whether any legacy writer is still scheduled.
- Approval for every write gate listed above.

The first safe implementation step is Phase 5B, a code-only port and test batch. It must not include migrations, bootstrap execution, remote environment changes, or CircleCI writes.
