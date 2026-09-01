# Phase 5 Provider & Database Topology

## Scope and Safety

This is a read-only point-in-time inspection. Each PostgreSQL session set and verified `default_transaction_read_only = on` before metadata queries, with statement, lock, and idle-transaction timeouts. No application rows were read, and no database, provider, CircleCI, Vercel, or application write operation occurred.

## Credential Sources Used

Only repository-scoped dotenv values were loaded in memory. Values were not recorded.

| Repository location | Relevant variable names |
| --- | --- |
| Degree Map `.env` | `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `NEON_API_KEY` |
| Courses `.env`, `.env.local` | `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `NEON_API_KEY`, `AIVEN_API_KEY` |
| Transfers `.env` | `POSTGRES_URL_NON_POOLING`, `NEON_API_KEY` |

No relevant CA-certificate variable was present in the inspected dotenv files.

## Domain-to-Database Mapping

| Domain | Logical database | Provider | Current endpoint classification |
| --- | --- | --- |
| Programs | DB-A | Neon | direct endpoint available; selected endpoint has no pooled marker |
| Courses | DB-B | Neon | direct endpoint available; selected endpoint has no pooled marker |
| Transfers | DB-C | Neon | direct |

Programs, Courses, and Transfers use different server endpoints and different databases. All three currently appear to use the same database role, without recording its identity. DB-C also contains Course schema and data, so it is a partial consolidation candidate despite not being the selected Course repository connection.

## Provider Resource Mapping

Three relevant Neon projects were matched internally to DB-A, DB-B, and DB-C. Each reports PostgreSQL 17, one read-write endpoint, one branch, and the same cloud region. Plan, compute state, autoscaling range, storage allocation, and provider connection-limit metadata were not exposed by the inspected API response.

An Aiven GET-only inspection found one service, but no current domain connection maps to it. Therefore there is no relevant Aiven candidate in this decision.

## Database Capacity

| DB | PostgreSQL | Ordinary capacity | Open / active connections | Point-in-time utilization | Approximate size | Public tables / views / indexes |
| --- | --- | ---:| ---:| ---:| ---:| ---:|
| DB-A | 17.11 | 106 | 1 / 1 | 0.9% | 18.7 MiB | 15 / 0 / 52 |
| DB-B | 17.11 | 106 | 1 / 1 | 0.9% | 14.4 MiB | 8 / 1 / 36 |
| DB-C | 17.11 | 106 | 1 / 1 | 0.9% | 13 / 1 / 47 |

Ordinary capacity is `max_connections` (112) minus PostgreSQL reserved connections (6). This is a point-in-time observation; historical peak utilization is unknown. Provider-reserved capacity beyond PostgreSQL metadata is unknown.

## Current Schema Presence

| DB | Programs | Courses | Transfers |
| --- | --- | --- | --- |
| DB-A | yes | no | no |
| DB-B | no | yes | no |
| DB-C | no | yes | yes |

The observed application objects match the three migrated domain groups. The provider-managed `neon_auth` schema is present but is not an application-domain collision. No unexpected application object collision was discovered.

## Approximate Dataset Sizes

All counts below are `pg_stat_user_tables.n_live_tup` estimates, not exact counts.

| DB | Live data | Staging data |
| --- | --- | --- |
| DB-A | Programs 227; degree courses 1,599; degree-course edges 1,299 | Programs 227; degree courses 1,599; degree-course edges 1,299 |
| DB-B | Courses 2,589; course data 2,589; prerequisites 2,062 | Courses 2,593; course data 2,593; prerequisites 2,067 |
| DB-C | Courses 2,589; course data 2,589; prerequisites 2,062; transfer courses 1,163 | Courses 2,589; course data 2,589; prerequisites 2,068; transfer courses 1,163 |

## Sync-State Baseline

| DB / domain | State | Active lease | Last completion | Next due | Safe aggregate observation |
| --- | --- | --- | --- | --- | --- |
| DB-A / Programs | idle | no | 2026-08-23 | 2026-08-30 | cursor, expected, and imported are 227; failures 0 |
| DB-B / Courses | idle | no | 2026-07-28 | 2026-09-28 | cursor, expected, and imported are 2,589 |
| DB-C / Courses | idle | no | 2026-07-28 | 2026-09-28 | cursor, expected, and imported are 2,589 |
| DB-C / Transfers | idle | no | 2026-07-28 | 2026-08-04 | cursor and expected are 871; imported mappings are 1,163 |

No error-message field or sync-item identifier was retrieved.

## Current Connection Pressure

Each logical database had one open and one active connection during its individual inspection. At 106 ordinary slots, observed utilization was approximately 0.9%. This does not establish peak or concurrent Vercel/CircleCI demand.

## Provider Pooling Availability

Current non-pooling connection variables identify direct endpoints. The selected Programs and Courses URLs do not expose a pooled marker, and the Neon API reports one read-write endpoint per matched project without separately confirming a pooled endpoint. Provider pooling availability and its production recommendation remain unknown; no endpoint was changed.

## Aiven Candidate Assessment

No relevant Aiven candidate exists: the sole read-only-discovered Aiven service does not map to a current domain connection.

## Neon Candidate Assessment

| Candidate | Current data | Capacity | Pooling evidence | Migration / rollback | Assessment |
| --- | --- | --- | --- | --- | --- |
| DB-A | Programs only | acceptable (106 ordinary slots) | unknown | add Courses and Transfers; preserve DB-A for rollback | acceptable |
| DB-B | Courses only | acceptable (106 ordinary slots) | unknown | add Programs and Transfers; preserve DB-B for rollback | acceptable |
| DB-C | Courses and Transfers | acceptable (106 ordinary slots) | unknown | add Programs; preserve all source databases for rollback | strongest consolidation starting point, pending Course-authority confirmation |

## Target Decision Matrix

| Logical target | Provider | Programs | Courses | Transfers | Capacity | Pooled endpoint available? | Storage headroom | Migration effort | Rollback simplicity | Main risks | Overall assessment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DB-A | Neon | yes | no | no | 106 ordinary slots | unknown | unknown | add two domains | acceptable | no pooling evidence; more data movement | acceptable |
| DB-B | Neon | no | yes | no | 106 ordinary slots | unknown | unknown | add two domains | acceptable | no pooling evidence; more data movement | acceptable |
| DB-C | Neon | no | yes, duplicate source exists | yes | 106 ordinary slots | unknown | unknown | add Programs | acceptable | Course authority is ambiguous; no pooling evidence | provisional preference |

## Human Decision Required

DB-C is the provisional preferred host because it already holds the Courses and Transfers object groups and their approximate live/staging data. A final authoritative target must not be selected until an owner confirms whether DB-B or DB-C is the authoritative Course source and confirms Neon plan, storage, pooling, and connection-limit behavior. No inspected evidence establishes a clear reliability advantage between the three projects.

A future fresh logical database on an approved existing service remains an option for clean rollback and bootstrap isolation. A fresh database on the same PostgreSQL service does not increase that service's maximum connection capacity. A future Neon branch requires separate provider-capacity confirmation before being treated as equivalent.

## Proposed Runtime Endpoint Strategy

Use a single shared runtime pool only after target approval. Prefer a provider pooled runtime endpoint only if Neon confirms its availability and compatibility; otherwise retain a direct endpoint with the shared pool constrained to one connection per Vercel instance.

## Proposed Writer Endpoint Strategy

Use a direct endpoint for migrations and long-running writer jobs. Their DDL, transactions, staging, and promotion operations require a stable long-lived connection; a provider pooled endpoint should not be assumed suitable without provider confirmation.

## Theoretical Connection Reduction

The current snhu-tools migration state can create up to three runtime pool connections per Vercel instance. A final shared pool reduces that to one: an approximate 66.7% per-instance reduction. Against the observed 106 ordinary slots, five simultaneous instances illustrate the difference: up to 15 runtime sessions today versus up to 5 after consolidation. This is theoretical because Vercel instance count is dynamic.

## Cutover Parity Baseline

| Domain | Logical source | Approximate primary live rows | Approximate staging rows | Sync state | Last completion | Database size |
| --- | --- | --- | --- | --- | --- | --- |
| Programs | DB-A | programs 227; degree courses 1,599; edges 1,299 | same estimates | idle | 2026-08-23 | 18.7 MiB |
| Courses | DB-B, with duplicate on DB-C | courses/data 2,589; prerequisites 2,062 | courses/data 2,593; prerequisites 2,067 | idle | 2026-07-28 | 14.4 MiB |
| Transfers | DB-C | transfer courses 1,163 | transfer courses 1,163 | idle | 2026-07-28 | 16.0 MiB |

No non-reproducible dataset was identified from metadata. Fresh-bootstrap reproducibility still requires a separately approved execution and parity validation.

## Security / Role Observations

The three current URLs appear to use the same database role. A future split between a runtime read role and a writer/migration role is a least-privilege hardening option; no role changes were made.

## Remaining Unknowns

- Which Course database is authoritative: DB-B or the duplicate Course data on DB-C.
- Neon plan, storage headroom, autoscaling, provider pooling availability, and historical connection peaks.
- Whether a pooled runtime endpoint is appropriate and whether it should be distinct from the writer endpoint.
- Approved target ownership, backup posture, and production cutover window.

## Recommended Next Step

Obtain target-selection approval after confirming Course authority and the outstanding Neon capacity/pooling facts. Do not execute migration, bootstrap, context, schedule, or runtime changes until that approval is granted.
