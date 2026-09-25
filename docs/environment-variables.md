# Environment Variable Reference for SNHU Tools

## Database

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`POSTGRES_URL`** | Vercel (Production & Preview), CircleCI, Local | PostgreSQL connection string for the consolidated `snhu_tools` database. Vercel runtime must use Neon’s pooled/PgBouncer endpoint. |
| **`POSTGRES_CA_CERT`** | Vercel, CircleCI, Local | Optional verified TLS CA certificate, supplied as an inline PEM string or filesystem path. |

Programs, Courses, and Transfers share one lazy `pg.Pool` per serverless instance. It uses `max: 3`, `idleTimeoutMillis: 5000`, and `connectionTimeoutMillis: 15000` (Fluid Compute may keep instances warm; stay under Neon pooled limits), and is registered with Vercel `attachDatabasePool()` for lifecycle handling. Migration and writer commands use short-lived direct `pg.Client` connections instead of the runtime pool.

## Application variables

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`KUALI_BASE_URL`** | All Environments | Base URL for SNHU Kuali API (`https://snhu.kuali.co`). |
| **`KUALI_CATALOG_ID`** | All Environments | Active SNHU catalog UUID (`6349a3f9164d00001c6c80da`). |
| **`KUALI_REQUEST_TIMEOUT_MS`** | Sync CLI | Request timeout in milliseconds (default: `10000`). |
| **`KUALI_USER_AGENT`** | Sync CLI | Descriptive HTTP User-Agent string. |
| **`REVALIDATE_SECRET`** | Vercel & CircleCI | Secret token protecting `POST /api/revalidate`. Must be set identically in Vercel and the CircleCI context. |
| **`SITE_URL`** | CircleCI | Production application base URL used by CircleCI for revalidation triggers. |
| **`NEXT_PUBLIC_SITE_URL`** | Client & Server | Canonical public production origin used by metadata, sitemap, robots, JSON-LD, and hostname redirects. |

## Durable snapshots (Blob)

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`BLOB_READ_WRITE_TOKEN`** | Vercel (Production), CircleCI writers | Vercel Blob read/write token for durable last-known-good catalog snapshots. Required for production snapshot publish/read. |
| **`SNAPSHOT_STORE`** | Local / tests / optional override | `blob` (default when `BLOB_READ_WRITE_TOKEN` is set) or `fs` (local filesystem under `.data/snapshots`, used in tests). |

Snapshots are published after each successful domain promote. Public reads prefer the durable snapshot; Postgres is used for bootstrap when no snapshot exists yet. See `docs/operations.md`.

## Optional Environment Variables

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`ENABLE_PROGRAM_FIXTURES`** | Development & tests | Enables fixture program data when no live database is configured. Defaults to enabled in tests unless set to `false`. Never used as a production outage fallback. |
| **`TEST_WITH_LIVE_DB`** | Tests | When `true`, allows tests to use a live database instead of fixtures. |
| **`HONEYBADGER_ENABLED`** | Server / edge / sync | Explicit kill switch. Must be the string `true` to allow server-side Honeybadger notices. Missing or any other value disables monitoring. Also requires a production runtime (`VERCEL_ENV=production`, or `NODE_ENV=production` when not on Vercel). Keep `false` while resolving quota exhaustion. |
| **`NEXT_PUBLIC_HONEYBADGER_ENABLED`** | Client | Browser kill switch for App Router error-boundary reporting. Must be `true` and the runtime must be production. Keep `false` while resolving quota exhaustion. |
| **`HONEYBADGER_API_KEY`** | Server | Honeybadger server error monitoring key. May remain configured when enabled flags are `false`; notices are not sent until the flags are turned on in production. |
| **`NEXT_PUBLIC_HONEYBADGER_API_KEY`** | Client | Honeybadger browser error monitoring key. Same: keys alone do not enable reporting. |
