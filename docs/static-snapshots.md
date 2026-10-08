# Static catalog snapshots

Public pages, API handlers, search, and sitemap generation read only the JSON bundles in `src/data/snapshots`. They never fall back to PostgreSQL. A corrupt, missing, empty, or checksum-mismatched required bundle fails explicitly.

The checked-in snapshot is a fixture, marked `fixture: true` in its manifest. It proves the architecture only and is not production-catalog validation.

## Weekly release procedure

1. Obtain an approved catalog export outside the production website runtime.
2. Run `STATIC_SNAPSHOT_SOURCE_DIR=/path/to/approved-export npm run snapshot:generate`. The directory must contain complete `programs.json`, `courses.json`, `transfers.json`, and `search.json` domain bundles. Without that variable, the generator intentionally produces fixtures only.
3. Validate schema, checksums, non-empty required counts, identifiers, relationships, and compare count/change thresholds with the previous committed manifest.
4. Review the generated JSON, size report, and diff; reject unexpected count drops.
5. Commit the complete immutable bundle and manifest, then create a new deployment. Do not deploy automatically.
6. Roll back by redeploying the prior Git commit, whose bundled manifest and JSON remain intact.

No database credentials belong in a snapshot. Generation failure writes no deployment bundle, so the prior deployed version remains the last good snapshot.
