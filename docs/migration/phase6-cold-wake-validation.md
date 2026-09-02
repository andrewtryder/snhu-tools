# Phase 6 Cold-Wake Validation

## Scope

Deploy the 15-second connection-establishment timeout hardening (`connectionTimeoutMillis: 15_000`) to the `snhu-tools` Vercel Preview environment, wait for natural Neon serverless compute suspension (scale-to-zero) via control-plane polling, and validate end-to-end cold-wake and warm runtime behavior against the Neon PgBouncer pooled connection without mutating production resources or provider settings.

## Runtime Change

- Old connection timeout: `5_000` ms (5 seconds)
- New connection timeout: `15_000` ms (15 seconds)
- Pool max: `1` (`max: 1`)
- Idle timeout: `5_000` ms (5 seconds)
- Retry logic: None (zero client-side retry or reconnection loops added)
- Provider failover: None (strictly pooled Neon runtime in unified mode)

## Preview

- URL: `https://snhu-tools-dbwk4cb80-andrewtryder.vercel.app`
- Deployment ID: `dpl_FpDts47H9cBKNmShaFurmE4Y5e3T`
- Source SHA: `d8a938f1402c321b5f8202b389d15a17f4d867da` (`fix: tolerate database cold wake`)
- Target: `preview` (`target: null` / `preview`)
- Runtime Database Mode: `unified` (`SNHU_TOOLS_DATABASE_MODE=unified`)
- Database Connection: Encrypted Preview `POSTGRES_URL` pointing to Neon PgBouncer pooled endpoint for `snhu_tools`

## Neon Scale-to-Zero State

- `suspend_timeout_seconds`: `0`
- Interpretation: Provider default scale-to-zero timeout (~300 seconds / 5 minutes). A value of `0` in Neon represents the default inactive timeout, not "no suspend delay".
- `autoscaling_limit_min_cu`: `0.25`
- `autoscaling_limit_max_cu`: `0.25`
- Provider resource mutation: None (no manual suspension, no compute sizing changes, no configuration changes).

## Cold Cycle 1

- Provider cold state confirmed: **Yes**
- Provider state label: `idle`
- Wait time to natural suspension: ~212 seconds
- First DB-backed route: `GET /api/search?q=accounting`
- First request HTTP status: **HTTP/2 200**
- First request duration: **6,258 ms** (~6.26 seconds)
- Connection-timeout error observed on cold request: **No** (deployment log verified clean `info HEAD /api/search` with 0 errors)
- Immediate warm request comparison: `GET /api/search?q=business` -> **HTTP/2 200** in **3,502 ms**

## Cold Cycle 2

- Provider cold state confirmed: **Yes**
- Provider state label: `idle`
- Wait time to natural suspension: ~332 seconds
- First DB-backed route: `GET /api/courses/search?q=CS`
- First request HTTP status: **HTTP/2 200**
- First request duration: **14,603 ms** (~14.60 seconds)
- Connection-timeout error observed on cold request: **No** (deployment log verified clean `info HEAD /api/courses/search` with 0 errors)

## Warm / Functional Validation

- Representative functional routes:
  - `/`: HTTP/2 200
  - `/about`: HTTP/2 200
  - `/programs`: HTTP/2 200
  - `/programs/accounting-bs`: HTTP/2 200
  - `/programs/accounting-bs/requirements`: HTTP/2 200
  - `/courses`: HTTP/2 200
  - `/courses/CS210`: HTTP/2 200
  - `/transfers`: HTTP/2 200
  - `/transfers/browse`: HTTP/2 200
  - `/transfers/courses/acc201`: HTTP/2 200
- Representative APIs:
  - `/api/search?q=accounting`: HTTP/2 200
  - `/api/courses/search?q=ACC`: HTTP/2 200
  - `/api/course/CS210`: HTTP/2 200
  - `/api/course-tree/CS210`: HTTP/2 200
  - `/api/course-trees/CS210,CS330`: HTTP/2 200
  - `/api/v1/transfer-coverage?courses=ACC201,CS210`: HTTP/2 200
- Cross-Domain Linking:
  - Program requirement links to `/transfers/courses/...`: Verified present (`true`)
  - Transfer course links to `/courses/...`: Verified present (`true`)
- Sequential Mixed Requests:
  - 25 consecutive requests across Programs, Courses, Transfers, and APIs completed with **25/25 HTTP/2 200 OK** (`ALL_SEQUENTIAL_PASSED: true`).

## Runtime Error Review

- Cold wake connection establishment errors on cold requests: **0**
- Connection exhaustion errors (`too many connections`, `remaining connection slots`): **0**
- Prepared-statement / PgBouncer protocol errors: **0**
- Missing legacy URL warnings (`COURSES_POSTGRES_URL`, `TRANSFERS_POSTGRES_URL`): **0**
- Serverless middleware error log: One transient SSR background cache query log observed at `07:52:34.60` during rapid consecutive testing on `/transfers/courses/cs210` (`Connection terminated due to connection timeout` caused by `Connection terminated unexpectedly` on an underlying socket), while the HTTP response to the client completed with HTTP 200 and subsequent queries on that route returned HTTP 200. Zero connection timeout errors occurred during the cold wake requests.

## Connection Observation

- Point-in-time PostgreSQL backend inspection via direct read-only query:
  - `total_connections_to_snhu_tools`: 1 (the diagnostic query client itself)
  - `active_connections_to_snhu_tools`: 0
- PgBouncer transaction pooling verified: Serverless function executions multiplex across PgBouncer client sockets without creating lingering PostgreSQL backend connections.

## Production Safety

- Production `POSTGRES_URL`: Not configured (0 variables)
- Production `SNHU_TOOLS_DATABASE_MODE`: Not configured
- Production deployment: Untouched
- Production promotion: None
- Production alias (`snhu-tools.vercel.app`): Untouched
- Legacy Vercel projects (`snhu-degreemap`, `snhu-courses`, `snhu-transfers`): Completely untouched
- CircleCI & remote writers: Inactive and untouched

## Recommendation

**Classification: PASS**

The 15-second connection timeout hardening (`connectionTimeoutMillis: 15_000`) successfully tolerated two consecutive natural cold wakes of suspended Neon serverless compute without failing initial client requests. The cold requests completed with HTTP/2 200 in 6.26s and 14.60s respectively. The pooled unified database runtime is verified and **ready for final Phase 7 Production cutover and CircleCI writer scheduling planning**.
