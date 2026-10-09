# Static catalog snapshots

Public pages, API handlers, search, and sitemap generation read only the JSON bundles in `src/data/snapshots`. They never fall back to PostgreSQL. A corrupt, missing, empty, or checksum-mismatched required bundle fails explicitly.

The checked-in snapshot is a fixture, marked `fixture: true` in its manifest. It proves the architecture only and is not production-catalog validation.

## Export commands

The source is always explicit; the command never falls back to fixtures.

```sh
# Isolated local/CI fixture validation. Does not change active snapshots.
npm run snapshot:generate -- --fixture

# Package a reviewed, non-fixture four-file export. Does not promote it.
npm run snapshot:generate -- --from-json /absolute/path/to/approved-export \
  --approval-reference CHANGE-123

# Approved read-only database export. This must be run only after explicit approval.
STATIC_EXPORT_APPROVED=true POSTGRES_URL='postgresql://readonly:…' \
  npm run snapshot:generate -- --from-postgres --approval-reference CHANGE-123

# Promote the exact directory that was staged and reviewed. This never re-exports PostgreSQL.
# The first approved catalog baseline additionally requires this explicit acknowledgement.
npm run snapshot:generate -- --promote-stage /absolute/path/to/.snapshot-stage-XXXX \
  --acknowledge-first-baseline

# Recover safely if the host interrupted a directory activation.
npm run snapshot:generate -- --recover-promotion
```

`--from-postgres` requires a PostgreSQL role with `CONNECT` plus `SELECT` on the catalog, program, course, transfer, prerequisite, and sync-state tables; it performs only `REPEATABLE READ READ ONLY` transactions. The exporter uses a single connection and closes its pool on every outcome.

## Staging, review, and rollback

Each run writes the four domain JSON files, `manifest.json`, and `report.json` into a newly created sibling staging directory. It validates schemas, complete domain counts, program directory/detail/sitemap agreement, course summaries/records/graph materialization, transfer row preservation, exact search-source equality, timestamps, secret-like keys, count reductions against an approved non-fixture baseline, and SHA-256 checksums; then it reloads and validates the staged files again.

## First real-export reconciliation

The first catalog export has no approved production baseline, so it must be reconciled before promotion. The staged `report.json` records the complete course source-to-export accounting at `.reconciliation.courses`: source record rows, exact duplicate rows, exported records, source prerequisite rows, exported relationships, exact duplicate relationships, external prerequisite references, duplicate external rows, and full database coverage breakdowns. Both `rejectedRows` values must be zero. A non-identical duplicate identifier or relationship is export-blocking rather than silently selected.

Valid external prerequisite relationships (where a prerequisite is not present in `courses_data`) are preserved rather than silently dropped, matching production graph visualization behavior. To prevent silent relationship loss or duplicate accounting discrepancies, external relationships are reconciled across three separate metrics:
1. **Raw unmatched prerequisite source rows** (`sourceCoverage.prerequisites.unmatched.externalPrerequisites`): Candidate prerequisite rows in PostgreSQL referring to an external course ID.
2. **Distinct exported external prerequisite edges** (`reconciliation.prerequisiteEdges.externalReferences`): Unique external prerequisite edges emitted in `edges.json`.
3. **Duplicate external prerequisite rows** (`reconciliation.prerequisiteEdges.duplicateExternalRows`): Duplicate source rows among external relationships that collapsed into a single edge.

With the same approved read-only connection used only during the approved export window, record the source counts and compare them to the stage report:

```sql
-- 1. courses_data Source Coverage Audit
SELECT 
  COUNT(*)::int AS total_rows,
  COUNT(*) FILTER (
    WHERE catalog_course_id IS NOT NULL AND BTRIM(catalog_course_id) != ''
  )::int AS candidate_rows,
  COUNT(*) FILTER (
    WHERE catalog_course_id IS NULL OR BTRIM(catalog_course_id) = ''
  )::int AS missing_catalog_course_id
FROM courses_data;

-- 2. prerequisites Source Coverage Audit
SELECT 
  COUNT(*)::int AS total_rows,
  COUNT(*) FILTER (
    WHERE parent.pid IS NOT NULL 
      AND parent.catalog_course_id IS NOT NULL 
      AND BTRIM(parent.catalog_course_id) != ''
      AND p.course_id IS NOT NULL 
      AND BTRIM(p.course_id) != ''
      AND UPPER(REGEXP_REPLACE(parent.catalog_course_id, '[\s-]+', '', 'g')) != UPPER(REGEXP_REPLACE(p.course_id, '[\s-]+', '', 'g'))
  )::int AS candidate_rows,
  COUNT(*) FILTER (
    WHERE parent.pid IS NULL
  )::int AS orphan_class_id,
  COUNT(*) FILTER (
    WHERE parent.pid IS NOT NULL 
      AND (parent.catalog_course_id IS NULL OR BTRIM(parent.catalog_course_id) = '')
  )::int AS parent_missing_catalog_course_id,
  COUNT(*) FILTER (
    WHERE parent.pid IS NOT NULL 
      AND parent.catalog_course_id IS NOT NULL 
      AND BTRIM(parent.catalog_course_id) != ''
      AND (p.course_id IS NULL OR BTRIM(p.course_id) = '')
  )::int AS missing_prerequisite_course_id,
  COUNT(*) FILTER (
    WHERE parent.pid IS NOT NULL 
      AND parent.catalog_course_id IS NOT NULL 
      AND BTRIM(parent.catalog_course_id) != ''
      AND p.course_id IS NOT NULL 
      AND BTRIM(p.course_id) != ''
      AND UPPER(REGEXP_REPLACE(parent.catalog_course_id, '[\s-]+', '', 'g')) = UPPER(REGEXP_REPLACE(p.course_id, '[\s-]+', '', 'g'))
  )::int AS self_reference,
  COUNT(*) FILTER (
    WHERE parent.pid IS NOT NULL 
      AND parent.catalog_course_id IS NOT NULL 
      AND BTRIM(parent.catalog_course_id) != ''
      AND p.course_id IS NOT NULL 
      AND BTRIM(p.course_id) != ''
      AND UPPER(REGEXP_REPLACE(parent.catalog_course_id, '[\s-]+', '', 'g')) != UPPER(REGEXP_REPLACE(p.course_id, '[\s-]+', '', 'g'))
      AND prerequisite.normalized_id IS NULL
  )::int AS external_prerequisites
FROM prerequisites p
LEFT JOIN courses_data parent ON parent.pid = p.class_id
LEFT JOIN (
  SELECT DISTINCT ON (UPPER(REGEXP_REPLACE(catalog_course_id, '[\s-]+', '', 'g'))) 
    catalog_course_id,
    UPPER(REGEXP_REPLACE(catalog_course_id, '[\s-]+', '', 'g')) AS normalized_id
  FROM courses_data 
  WHERE catalog_course_id IS NOT NULL AND BTRIM(catalog_course_id) != '' 
  ORDER BY UPPER(REGEXP_REPLACE(catalog_course_id, '[\s-]+', '', 'g')), pid
) prerequisite ON prerequisite.normalized_id = UPPER(REGEXP_REPLACE(p.course_id, '[\s-]+', '', 'g'));

-- 3. Candidate Courses Extraction
SELECT title, pid, catalog_course_id, description, academic_level, credits, subject_code 
FROM courses_data 
WHERE catalog_course_id IS NOT NULL AND BTRIM(catalog_course_id) != '' 
ORDER BY catalog_course_id, pid;

-- 4. Candidate Prerequisite Edges Extraction (Preserving External References)
SELECT 
  parent.catalog_course_id AS parent_id, 
  parent.title AS parent_title, 
  COALESCE(prerequisite.catalog_course_id, p.course_id) AS child_id, 
  COALESCE(prerequisite.title, NULLIF(BTRIM(p.course_title), ''), p.course_id) AS child_title 
FROM prerequisites p 
JOIN courses_data parent ON parent.pid = p.class_id 
LEFT JOIN (
  SELECT DISTINCT ON (UPPER(REGEXP_REPLACE(catalog_course_id, '[\s-]+', '', 'g'))) 
    catalog_course_id, 
    title,
    UPPER(REGEXP_REPLACE(catalog_course_id, '[\s-]+', '', 'g')) AS normalized_id
  FROM courses_data 
  WHERE catalog_course_id IS NOT NULL AND BTRIM(catalog_course_id) != '' 
  ORDER BY UPPER(REGEXP_REPLACE(catalog_course_id, '[\s-]+', '', 'g')), pid
) prerequisite ON prerequisite.normalized_id = UPPER(REGEXP_REPLACE(p.course_id, '[\s-]+', '', 'g')) 
WHERE parent.catalog_course_id IS NOT NULL 
  AND BTRIM(parent.catalog_course_id) != '' 
  AND p.course_id IS NOT NULL 
  AND BTRIM(p.course_id) != '' 
  AND UPPER(REGEXP_REPLACE(parent.catalog_course_id, '[\s-]+', '', 'g')) != UPPER(REGEXP_REPLACE(p.course_id, '[\s-]+', '', 'g'))
ORDER BY parent.catalog_course_id, COALESCE(prerequisite.catalog_course_id, p.course_id), parent.pid;
```

```sh
STAGE_DIR=/absolute/path/to/.snapshot-stage-XXXX
jq '.reconciliation.courses' "$STAGE_DIR/report.json"
jq '{ids: .meta.counts.ids, records: .meta.counts.records, edges: .meta.counts.edges}' "$STAGE_DIR/courses.json"
```

The source counts must satisfy the following exact accounting identities:
1. `courses_data.totalRows = candidateRows + missingCatalogCourseId`
2. `courses_data.candidateRows = records.sourceRows = exportedRecords + duplicateRows + rejectedRows` (where `rejectedRows = 0`)
3. `prerequisites.totalRows = candidateRows + orphanClassId + parentMissingCatalogCourseId + missingPrerequisiteCourseId + selfReference`
4. `prerequisites.candidateRows = prerequisiteEdges.sourceRows = exportedEdges + duplicateRows + rejectedRows` (where `rejectedRows = 0`)
5. `prerequisites.unmatched.externalPrerequisites = prerequisiteEdges.externalReferences + prerequisiteEdges.duplicateExternalRows`

Review every nonzero duplicate count and every external prerequisite reference. Compare the staged public route inventory with the currently deployed/active snapshot before approving the first baseline:

```sh
jq -r '.sitemap[].slug' "$STAGE_DIR/programs.json" | sort > /tmp/staged-program-slugs
jq -r '.sitemap[].slug' src/data/snapshots/programs.json | sort > /tmp/active-program-slugs
comm -3 /tmp/active-program-slugs /tmp/staged-program-slugs

jq -r '.ids[]' "$STAGE_DIR/courses.json" | sort > /tmp/staged-course-ids
jq -r '.ids[]' src/data/snapshots/courses.json | sort > /tmp/active-course-ids
comm -3 /tmp/active-course-ids /tmp/staged-course-ids
```

For the current fixture-only deployment those differences are expected; they are a review checklist, not a substitute for source count reconciliation. Preserve the SQL results, `report.json`, URL diffs, and approval reference with the release record.

The report and manifest contain fixture/non-fixture provenance, a source digest, and an approval reference. JSON imports require an explicit review reference. PostgreSQL exports require both `STATIC_EXPORT_APPROVED=true` and the review reference. Fixture mode builds only from the source-controlled test catalog, never the active snapshot directory; the known checked-in fixture bundle signatures also cannot be relabeled as non-fixture data. Missing or fixture-only baselines are explicitly reported and are never treated as approved production baselines.

Promotion is opt-in and accepts only a sibling `.snapshot-stage-*` directory. It reloads that stage, verifies its manifest, provenance, checksums, counts, cross-domain relationships, and baseline threshold immediately before activation. Fixture or unapproved stages cannot be promoted. The current filesystem layout cannot atomically exchange two directories, so activation is deliberately **not** described as atomic: it journals the move, restores the prior directory on a handled failure, and `--recover-promotion` restores the prior active directory after an interruption between renames. Prior versions remain as rollback targets. A failed extraction or validation never writes the active directory.

For a weekly refresh, run an approved export during a catalog synchronization-safe window. PostgreSQL mode captures catalog/program/transfer update markers before and after the three domain exports and blocks release if any marker changes. This detects observed sync changes but cannot prove an unchanged shared database snapshot across separate domain transactions; the quiet window remains a required operational control. Review `report.json`, inspect the staged diff, then promote that exact stage only after approval.

For the first real export, obtain explicit production approval, create a least-privilege read-only credential, choose a quiet synchronization window, run without `--promote`, review the non-fixture manifest/report and snapshot sizes, validate a build with `POSTGRES_URL` unset against the staged data, then promote and commit the resulting reviewed files in a separate approved change.

No database credentials belong in a snapshot. Generation failure writes no deployment bundle, so the prior deployed version remains the last good snapshot.
