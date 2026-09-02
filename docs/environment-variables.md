# Environment Variable Reference for SNHU Degree Map & Tools

## Database Consolidation & Runtime Mode

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`SNHU_TOOLS_DATABASE_MODE`** | Vercel, Local, CI | Controls runtime database pool consolidation mode. Values: `"legacy"` (default when unset or empty) or `"unified"`. In **`legacy`** mode, Programs uses `POSTGRES_URL`, Courses uses `COURSES_POSTGRES_URL`, and Transfers uses `TRANSFERS_POSTGRES_URL` (creating up to 3 isolated runtime `pg.Pool` instances). In **`unified`** mode, all three feature domains share one single global `pg.Pool` (`max: 1`) connected to `POSTGRES_URL`. Any other non-empty value throws an immediate fail-fast error. |
| **`POSTGRES_URL`** | Vercel (Production & Preview), CircleCI, Local | Primary PostgreSQL connection string. Sourced by Programs in legacy mode, and shared by Programs, Courses, and Transfers in unified mode. The Next.js runtime uses a shared `pg.Pool` with `max: 1` and Vercel `attachDatabasePool()` lifecycle management. Write/sync CLI commands use short-lived `pg.Client` connections. |
| **`COURSES_POSTGRES_URL`** | Vercel (Legacy), Local | Courses database connection string. Required in legacy mode; ignored in unified mode. Retained during migration as a rollback bridge. |
| **`TRANSFERS_POSTGRES_URL`** | Vercel (Legacy), Local | Transfers database connection string. Required in legacy mode; ignored in unified mode. Retained during migration as a rollback bridge. |

## Required Application Environment Variables

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`KUALI_BASE_URL`** | All Environments | Base URL for SNHU Kuali API (`https://snhu.kuali.co`). |
| **`KUALI_CATALOG_ID`** | All Environments | Active SNHU catalog UUID (`6349a3f9164d00001c6c80da`). |
| **`KUALI_REQUEST_TIMEOUT_MS`** | Sync CLI | Request timeout in milliseconds (default: `10000`). |
| **`KUALI_USER_AGENT`** | Sync CLI | Descriptive HTTP User-Agent string. |
| **`REVALIDATE_SECRET`** | Vercel & CircleCI | Secret token protecting `POST /api/revalidate`. Must be set identically in Vercel and the CircleCI context. |
| **`SITE_URL`** | CircleCI | Production application base URL (e.g. `https://snhu-tools.vercel.app`) used by CircleCI for revalidation triggers. Required for later production cutover. |
| **`NEXT_PUBLIC_SITE_URL`** | Client & Server | Preferred canonical public production origin (e.g. `https://snhu-tools.vercel.app`) for canonical metadata, sitemap/robots URLs, JSON-LD, and production hostname redirects (www / http / `*.vercel.app` → this host). Preview deployment hosts are rejected. Required for later production cutover. |

## Optional Environment Variables

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`POSTGRES_CA_CERT`** | Vercel, CircleCI, Local | Verified TLS CA certificate for primary database. Accepts an inline PEM string or filesystem path. Used with `rejectUnauthorized: true`. |
| **`COURSES_POSTGRES_CA_CERT`** | Vercel, Local | CA certificate for Courses database in legacy mode. |
| **`TRANSFERS_POSTGRES_CA_CERT`** | Vercel, Local | CA certificate for Transfers database in legacy mode. |
| **`ENABLE_PROGRAM_FIXTURES`** | Development & tests | Enables fixture program data when no live database is configured. Defaults to enabled in tests unless set to `false`. |
| **`TEST_WITH_LIVE_DB`** | Tests | When `true`, allows tests to use a live database instead of fixtures. |
| **`HONEYBADGER_API_KEY`** | Server | Honeybadger server error monitoring key. |
| **`NEXT_PUBLIC_HONEYBADGER_API_KEY`** | Client | Honeybadger browser error monitoring key. |

## Database Runtime Architecture Notes

- **Application Pool Consolidation vs. Provider Pooling:**
  - *Application Pool Consolidation* (this phase) consolidates the 3 runtime domain pools (`pgPool`, `coursesPgPool`, `transfersPgPool`) into a single `pg.Pool` instance (`max: 1`) per serverless execution instance under `SNHU_TOOLS_DATABASE_MODE="unified"`.
  - *Provider Pooling* (future phase) refers to Neon PgBouncer / pooled endpoint activation (`pooler_enabled`), which operates upstream on the database infrastructure.
- **Runtime Pool Characteristics:** In unified mode, exactly one `pg.Pool` exists per serverless instance (`max: 1`, `idleTimeoutMillis: 5000`, `connectionTimeoutMillis: 5000`) registered with `@vercel/functions` `attachDatabasePool()`.
- **Administrative / Writer Connections:** Migration and domain synchronization CLI scripts use direct short-lived `pg.Client` connections to `POSTGRES_URL` that connect, execute, and disconnect without registering with Vercel lifecycle pools.
- **Rollback Safety:** Default runtime mode is `legacy` when `SNHU_TOOLS_DATABASE_MODE` is unset or empty, ensuring zero disruption to existing environments prior to explicit opt-in.
