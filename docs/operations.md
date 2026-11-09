# Operations

- Canonical application: `https://snhu-tools.vercel.app`.
- Runtime data is served from committed, checksum-verified static JSON snapshots in `src/data/snapshots/`. The Vercel runtime does not require `POSTGRES_URL` or live database connections.
- Upstream catalog data is stored in the consolidated Neon `snhu_tools` PostgreSQL database. CircleCI runs weekly writer jobs using short-lived direct `pg.Client` connections: Courses Sunday 03:00 UTC, Transfers Sunday 04:00 UTC, and Programs Sunday 05:00 UTC.
- Every Monday at 07:00 UTC, `.github/workflows/weekly-snapshots.yml` exports the latest database state into `src/data/snapshots/`, runs 10 integrity and quiescence gates, and opens an automated pull request if catalog data changed.
- Honeybadger reports application and sync faults. Verify `/`, `/programs`, `/courses`, `/transfers`, `/search?q=CS210`, `/sitemap.xml`, and `/robots.txt` after operational changes.
- `snhu-degreemap`, `snhu-courses`, and `snhu-transfers` remain permanent HTTP 308 redirect hosts and must stay deployed.
