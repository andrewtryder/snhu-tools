# Environment Variable Reference for SNHU Tools

## Database

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`POSTGRES_URL`** | Vercel (Production & Preview), CircleCI, Local | PostgreSQL connection string for the consolidated `snhu_tools` database. Vercel runtime must use Neon’s pooled/PgBouncer endpoint. |
| **`POSTGRES_CA_CERT`** | Vercel, CircleCI, Local | Optional verified TLS CA certificate, supplied as an inline PEM string or filesystem path. |

Programs, Courses, and Transfers share one lazy `pg.Pool` per serverless instance. It uses `max: 1`, `idleTimeoutMillis: 5000`, and `connectionTimeoutMillis: 15000`, and is registered with Vercel `attachDatabasePool()` for lifecycle handling. Migration and writer commands use short-lived direct `pg.Client` connections instead of the runtime pool.

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

## Optional Environment Variables

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`ENABLE_PROGRAM_FIXTURES`** | Development & tests | Enables fixture program data when no live database is configured. Defaults to enabled in tests unless set to `false`. |
| **`TEST_WITH_LIVE_DB`** | Tests | When `true`, allows tests to use a live database instead of fixtures. |
| **`HONEYBADGER_API_KEY`** | Server | Honeybadger server error monitoring key. |
| **`NEXT_PUBLIC_HONEYBADGER_API_KEY`** | Client | Honeybadger browser error monitoring key. |
