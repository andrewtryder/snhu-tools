# Environment Variable Reference for SNHU Tools

## Database (Sync, Migration & Snapshot Export CLI Only)

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`POSTGRES_URL`** | CircleCI, GitHub Actions (`weekly-snapshots`), Local CLI | PostgreSQL connection string for the consolidated `snhu_tools` database. Used only by offline migration, sync writer, and snapshot export scripts (not required in Vercel runtime). |
| **`POSTGRES_CA_CERT`** | CircleCI, GitHub Actions, Local CLI | Optional verified TLS CA certificate, supplied as an inline PEM string or filesystem path. |

## Application & Sync Variables

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`KUALI_BASE_URL`** | Sync CLI | Base URL for SNHU Kuali API (`https://snhu.kuali.co`). |
| **`KUALI_CATALOG_ID`** | Sync CLI | Active SNHU catalog UUID (`6349a3f9164d00001c6c80da`). |
| **`KUALI_CATALOG_YEAR_LABEL`** | Program Sync CLI | Academic catalog year label (for example `2025-2026`). |
| **`KUALI_REQUEST_TIMEOUT_MS`** | Sync CLI | Request timeout in milliseconds (default: `10000`). |
| **`KUALI_USER_AGENT`** | Sync CLI | Descriptive HTTP User-Agent string. |
| **`NEXT_PUBLIC_SITE_URL`** | Client & Server | Canonical public production origin used by metadata, sitemap, robots, JSON-LD, and hostname redirects. |

## Optional Monitoring Variables

| Variable Name | Context / Location | Description |
| :--- | :--- | :--- |
| **`HONEYBADGER_API_KEY`** | Server & Sync CLI | Honeybadger server and background writer error monitoring key. |
| **`NEXT_PUBLIC_HONEYBADGER_API_KEY`** | Client | Honeybadger browser error monitoring key. |
