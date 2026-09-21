# Operations

- Canonical application: `https://snhu-tools.vercel.app`.
- Production data lives in the consolidated Neon `snhu_tools` database. The runtime uses its pooled endpoint; migrations and CircleCI writer jobs use direct short-lived connections.
- CircleCI runs weekly writers: Courses Sunday 03:00 UTC, Transfers Sunday 04:00 UTC, and Programs Sunday 05:00 UTC. Each writer performs scoped revalidation after a successful promotion.
- Neon wake minimization: read-heavy pages stay static/ISR between promotions; search responses use a 15-minute edge cache; transfer coverage uses a 7-day tagged data-cache fallback and a 1-hour public API edge cache; `/data-status` is refreshed on Programs promotion instead of every five minutes.
- Successful production revalidation also submits the canonical URLs for that data scope to IndexNow. The public verification key is hosted at `/7d4543f657b1ccc9b149991d961be00c.txt`. IndexNow failures are logged but do not turn a successful data promotion/revalidation into a failed sync.
- Honeybadger reports application faults. Verify `/`, `/programs`, `/courses`, `/transfers`, `/search?q=CS210`, `/sitemap.xml`, and `/robots.txt` after operational changes.
- `snhu-degreemap`, `snhu-courses`, and `snhu-transfers` remain permanent HTTP 308 redirect hosts and must stay deployed.
