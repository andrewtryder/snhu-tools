# Operations

- Canonical application: `https://snhu-tools.vercel.app`.
- Production data lives in the consolidated Neon `snhu_tools` database. The runtime uses its pooled endpoint; migrations and CircleCI writer jobs use short-lived direct connections.
- CircleCI runs weekly writers: Courses Sunday 03:00 UTC, Transfers Sunday 04:00 UTC, and Programs Sunday 05:00 UTC. Each writer performs scoped revalidation after a successful promotion.
- After a successful promote, the writer script publishes a durable domain snapshot (plus the search index snapshot) before CircleCI triggers revalidation. If snapshot publish fails, the sync exits non-zero so revalidation is skipped.
- Public reads are **snapshot-first**: Next.js `unstable_cache` uses `revalidate: false` with tag invalidation after promote. Durability comes from Vercel Blob (or local FS in tests/dev), not from TTL. A TTL must never erase last-known-good catalog data during a Neon outage.
- Neon wake minimization: read-heavy pages stay static/ISR between promotions; search responses use a 15-minute edge cache (empty degraded outages use `private, no-store`); transfer coverage uses tag-invalidated data-cache + a 1-hour public API edge cache; `/data-status` is refreshed on Programs promotion instead of every five minutes.
- Successful production revalidation also submits the canonical URLs for that data scope to IndexNow. The public verification key is hosted at `/7d4543f657b1ccc9b149991d961be00c.txt`. IndexNow failures are logged but do not turn a successful data promotion/revalidation into a failed sync.
- Honeybadger reports application faults when explicitly enabled. Verify `/`, `/programs`, `/courses`, `/transfers`, `/search?q=CS210`, `/sitemap.xml`, and `/robots.txt` after operational changes.
- `snhu-degreemap`, `snhu-courses`, and `snhu-transfers` remain permanent HTTP 308 redirect hosts and must stay deployed.

## Durable snapshots

### Bootstrap (first publish)

1. Ensure `BLOB_READ_WRITE_TOKEN` is set in Vercel (read) and CircleCI writer contexts (read+publish). Local/tests can use `SNAPSHOT_STORE=fs`.
2. Publication is **opt-in**: set `SNAPSHOT_PUBLISH_ENABLED=true` only in CircleCI writer contexts or a secure bootstrap shell. Leave it unset/false on Vercel Preview/Development/Production app deploys so they can read the canonical snapshot but cannot flip `current.json`.
3. With Neon available and promoted data present, run:
   - `SNAPSHOT_PUBLISH_ENABLED=true npm run snapshot:bootstrap` (all domains + search), or
   - `SNAPSHOT_PUBLISH_ENABLED=true npm run snapshot:publish -- --domain=courses|programs|transfers|search`
4. Verify with `npm run snapshot:verify` (reads only; does not require publish enabled).
5. Successful weekly writers also publish after promote when CircleCI has `SNAPSHOT_PUBLISH_ENABLED=true`. If publish fails, the sync exits non-zero so CircleCI skips revalidation.
6. Confirm `/data-status` shows snapshot published + source updated timestamps.

Do **not** merge/deploy snapshot-first production until the first Blob snapshot exists (or you have confirmed the no-snapshot DB fallback still serves the current site).

### Weekly cadence

Writers promote → publish domain snapshot → publish search snapshot → revalidate tags/paths. Search index is rebuilt from published domain bundles when available.

### Outage procedure

1. Public traffic continues from the last durable snapshot (Blob). Do not purge snapshots or force empty cache fills.
2. Keep Honeybadger flags `false` while resolving Neon quota/compute exhaustion if error volume is the concern.
3. After Neon recovers, the next successful weekly promote refreshes snapshots; or manually re-run the affected writer with `--ignore-lease` if needed.
4. Do **not** enable program fixtures in production as an outage fallback.

Cross-domain search indexes record `builtFrom` domain versions. `npm run snapshot:verify` fails if the search snapshot was built from older Programs/Courses/Transfers versions than the current manifest.

### Rollback

```bash
npx tsx -e 'import { rollbackToPreviousManifest } from "./src/lib/snapshots/index.ts";
rollbackToPreviousManifest().then((m) => console.log(JSON.stringify(m, null, 2)));'
```

Then revalidate the affected tags (`program-data`, `catalog-data`, `transfer-data`) via `POST /api/revalidate`. Rollback repoints the current manifest to the previous pointer; immutable version objects remain until GC.
