import type { Pool } from "pg";
import type { CourseRecord, CourseSummary, GraphEdge } from "@/features/courses/lib/courses";
import type { CourseTree } from "@/features/courses/lib/courseGraphLayout";

export type CourseSourceCoverage = {
  coursesData: {
    totalRows: number;
    candidateRows: number;
    excluded: {
      missingCatalogCourseId: number;
    };
  };
  prerequisites: {
    totalRows: number;
    candidateRows: number;
    excluded: {
      orphanClassId: number;
      parentMissingCatalogCourseId: number;
      missingPrerequisiteCourseId: number;
      selfReference: number;
    };
    unmatched: {
      externalPrerequisites: number;
    };
  };
};

export type CourseReconciliation = { records: { sourceRows: number; exportedRecords: number; duplicateRows: number; rejectedRows: number }; prerequisiteEdges: { sourceRows: number; exportedEdges: number; duplicateRows: number; rejectedRows: number; externalReferences: number; duplicateExternalRows: number }; sourceCoverage?: CourseSourceCoverage };
export type CoursesExport = { meta: { domain: "courses"; counts: { ids: number; records: number; edges: number } }; ids: string[]; summaries: CourseSummary[]; records: Record<string, CourseRecord>; edges: GraphEdge[]; lastModified: string | null; reconciliation: CourseReconciliation };
type Row = Partial<CourseRecord>;
type EdgeRow = { parent_id?: string; parent_title?: string; child_id?: string; child_title?: string };
type ReconciliationIssue = { kind: "record" | "edge"; reason: string; identifier: string };
const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "");
const clean = (value: unknown) => value == null ? null : String(value).trim() || null;
const text = (value: unknown) => String(value ?? "").trim();
const emptyReconciliation = (recordRows: number, edgeRows: number, sourceCoverage?: CourseSourceCoverage): CourseReconciliation => ({ records: { sourceRows: recordRows, exportedRecords: 0, duplicateRows: 0, rejectedRows: 0 }, prerequisiteEdges: { sourceRows: edgeRows, exportedEdges: 0, duplicateRows: 0, rejectedRows: 0, externalReferences: 0, duplicateExternalRows: 0 }, ...(sourceCoverage ? { sourceCoverage } : {}) });

/** An export-blocking source-data error with non-sensitive reconciliation evidence. */
export class CourseExportValidationError extends Error {
  readonly reconciliation: CourseReconciliation;
  readonly issues: ReconciliationIssue[];
  constructor(reconciliation: CourseReconciliation, issues: ReconciliationIssue[]) { super(`Course export rejected ${issues.length} malformed or conflicting source row(s): ${issues.map((issue) => `${issue.kind}:${issue.reason}:${issue.identifier}`).join(", ")}`); this.name = "CourseExportValidationError"; this.reconciliation = reconciliation; this.issues = issues; }
}

const recordKey = (record: CourseRecord) => JSON.stringify([record.catalog_course_id, record.title, record.pid, record.description, record.academic_level, record.credits, record.subject_code]);
const edgeKey = (edge: GraphEdge) => JSON.stringify([edge.parentId, edge.parentTitle, edge.childId, edge.childTitle]);

/** Pure, strict transformation. It cannot silently discard a source record or prerequisite relationship. */
export function transformCourses(rows: Row[], edgeRows: EdgeRow[], completedAt: Date | string | null, sourceCoverage?: CourseSourceCoverage): CoursesExport {
  const reconciliation = emptyReconciliation(rows.length, edgeRows.length, sourceCoverage);
  const issues: ReconciliationIssue[] = [];
  const grouped = new Map<string, CourseRecord[]>();
  for (const row of rows) {
    const id = normalize(row.catalog_course_id); const title = text(row.title); const pid = text(row.pid);
    if (!id || !title || !pid) { reconciliation.records.rejectedRows++; issues.push({ kind: "record", reason: !id ? "missing-catalog-course-id" : !title ? "missing-title" : "missing-pid", identifier: id || "<empty>" }); continue; }
    const record: CourseRecord = { title, pid, catalog_course_id: id, description: clean(row.description), academic_level: clean(row.academic_level), credits: clean(row.credits), subject_code: clean(row.subject_code) };
    grouped.set(id, [...(grouped.get(id) ?? []), record]);
  }
  const records: Record<string, CourseRecord> = {};
  for (const id of [...grouped.keys()].sort()) {
    const candidates = grouped.get(id)!.sort((left, right) => recordKey(left).localeCompare(recordKey(right)));
    const keys = new Set(candidates.map(recordKey));
    if (keys.size > 1) { reconciliation.records.rejectedRows += candidates.length; issues.push({ kind: "record", reason: "conflicting-duplicate-identifier", identifier: id }); continue; }
    records[id] = candidates[0]; reconciliation.records.duplicateRows += candidates.length - 1;
  }
  reconciliation.records.exportedRecords = Object.keys(records).length;
  const edgeGroups = new Map<string, GraphEdge[]>();
  for (const source of edgeRows) {
    const parentId = normalize(source.parent_id); const childId = normalize(source.child_id); const parentTitle = text(source.parent_title); const childTitle = text(source.child_title);
    const identifier = `${parentId || "<empty>"}->${childId || "<empty>"}`;
    if (!parentId || !childId || !parentTitle || !childTitle) { reconciliation.prerequisiteEdges.rejectedRows++; issues.push({ kind: "edge", reason: "missing-identifier-or-title", identifier }); continue; }
    if (parentId === childId) { reconciliation.prerequisiteEdges.rejectedRows++; issues.push({ kind: "edge", reason: "self-reference", identifier }); continue; }
    const parent = records[parentId];
    if (!parent) { reconciliation.prerequisiteEdges.rejectedRows++; issues.push({ kind: "edge", reason: "unknown-parent-course", identifier }); continue; }
    if (parent.title !== parentTitle) { reconciliation.prerequisiteEdges.rejectedRows++; issues.push({ kind: "edge", reason: "parent-title-conflicts-with-course", identifier }); continue; }
    if (records[childId] && records[childId].title !== childTitle) { reconciliation.prerequisiteEdges.rejectedRows++; issues.push({ kind: "edge", reason: "child-title-conflicts-with-course", identifier }); continue; }
    const edge: GraphEdge = { parentId, parentTitle, childId, childTitle };
    edgeGroups.set(`${parentId}\0${childId}`, [...(edgeGroups.get(`${parentId}\0${childId}`) ?? []), edge]);
  }
  const edges: GraphEdge[] = [];
  let duplicateExternalRows = 0;
  for (const key of [...edgeGroups.keys()].sort()) {
    const candidates = edgeGroups.get(key)!.sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));
    const keys = new Set(candidates.map(edgeKey));
    if (keys.size > 1) { reconciliation.prerequisiteEdges.rejectedRows += candidates.length; issues.push({ kind: "edge", reason: "conflicting-duplicate-relationship", identifier: key.replace("\0", "->") }); continue; }
    const edge = candidates[0];
    edges.push(edge);
    const duplicates = candidates.length - 1;
    reconciliation.prerequisiteEdges.duplicateRows += duplicates;
    if (!records[edge.childId]) {
      reconciliation.prerequisiteEdges.externalReferences++;
      duplicateExternalRows += duplicates;
    }
  }
  reconciliation.prerequisiteEdges.exportedEdges = edges.length;
  reconciliation.prerequisiteEdges.duplicateExternalRows = duplicateExternalRows;
  if (sourceCoverage) {
    if (rows.length !== sourceCoverage.coursesData.candidateRows) {
      throw new Error(`Course records row count (${rows.length}) does not match candidate row count (${sourceCoverage.coursesData.candidateRows})`);
    }
    if (edgeRows.length !== sourceCoverage.prerequisites.candidateRows) {
      throw new Error(`Prerequisite edges row count (${edgeRows.length}) does not match candidate row count (${sourceCoverage.prerequisites.candidateRows})`);
    }
    if (sourceCoverage.prerequisites.unmatched.externalPrerequisites !== reconciliation.prerequisiteEdges.externalReferences + duplicateExternalRows) {
      throw new Error(`Prerequisite external references count (${sourceCoverage.prerequisites.unmatched.externalPrerequisites}) does not balance with exported (${reconciliation.prerequisiteEdges.externalReferences}) and duplicate (${duplicateExternalRows}) external edges`);
    }
    reconciliation.sourceCoverage = sourceCoverage;
  }
  if (issues.length) throw new CourseExportValidationError(reconciliation, issues);
  const ids = Object.keys(records).sort();
  if (!ids.length) throw new CourseExportValidationError(reconciliation, [{ kind: "record", reason: "empty-export", identifier: "<all>" }]);
  const summaries = ids.map((catalog_course_id) => ({ catalog_course_id, title: records[catalog_course_id].title }));
  const date = completedAt ? new Date(completedAt) : null;
  return { meta: { domain: "courses", counts: { ids: ids.length, records: ids.length, edges: edges.length } }, ids, summaries, records, edges, lastModified: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null, reconciliation };
}

/** Explicit, bounded, read-only database extraction. Caller owns and closes the pool. */
export async function exportCoursesFromDatabase(pool: Pick<Pool, "connect">): Promise<CoursesExport> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const coursesCoverage = await client.query<{ total_rows: number; candidate_rows: number; missing_catalog_course_id: number }>(`
      SELECT 
        COUNT(*)::int AS total_rows,
        COUNT(*) FILTER (WHERE catalog_course_id IS NOT NULL AND BTRIM(catalog_course_id) != '')::int AS candidate_rows,
        COUNT(*) FILTER (WHERE catalog_course_id IS NULL OR BTRIM(catalog_course_id) = '')::int AS missing_catalog_course_id
      FROM courses_data
    `);
    const prerequisitesCoverage = await client.query<{ total_rows: number; candidate_rows: number; orphan_class_id: number; parent_missing_catalog_course_id: number; missing_prerequisite_course_id: number; self_reference: number; external_prerequisites: number }>(`
      SELECT 
        COUNT(*)::int AS total_rows,
        COUNT(*) FILTER (
          WHERE parent.pid IS NOT NULL 
            AND parent.catalog_course_id IS NOT NULL 
            AND BTRIM(parent.catalog_course_id) != ''
            AND p.course_id IS NOT NULL 
            AND BTRIM(p.course_id) != ''
            AND UPPER(REGEXP_REPLACE(parent.catalog_course_id, '[\\s-]+', '', 'g')) != UPPER(REGEXP_REPLACE(p.course_id, '[\\s-]+', '', 'g'))
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
            AND UPPER(REGEXP_REPLACE(parent.catalog_course_id, '[\\s-]+', '', 'g')) = UPPER(REGEXP_REPLACE(p.course_id, '[\\s-]+', '', 'g'))
        )::int AS self_reference,
        COUNT(*) FILTER (
          WHERE parent.pid IS NOT NULL 
            AND parent.catalog_course_id IS NOT NULL 
            AND BTRIM(parent.catalog_course_id) != ''
            AND p.course_id IS NOT NULL 
            AND BTRIM(p.course_id) != ''
            AND UPPER(REGEXP_REPLACE(parent.catalog_course_id, '[\\s-]+', '', 'g')) != UPPER(REGEXP_REPLACE(p.course_id, '[\\s-]+', '', 'g'))
            AND prerequisite.normalized_id IS NULL
        )::int AS external_prerequisites
      FROM prerequisites p
      LEFT JOIN courses_data parent ON parent.pid = p.class_id
      LEFT JOIN (
        SELECT DISTINCT ON (UPPER(REGEXP_REPLACE(catalog_course_id, '[\\s-]+', '', 'g'))) 
          catalog_course_id,
          UPPER(REGEXP_REPLACE(catalog_course_id, '[\\s-]+', '', 'g')) AS normalized_id
        FROM courses_data 
        WHERE catalog_course_id IS NOT NULL AND BTRIM(catalog_course_id) != '' 
        ORDER BY UPPER(REGEXP_REPLACE(catalog_course_id, '[\\s-]+', '', 'g')), pid
      ) prerequisite ON prerequisite.normalized_id = UPPER(REGEXP_REPLACE(p.course_id, '[\\s-]+', '', 'g'))
    `);
    const records = await client.query<CourseRecord>("SELECT title, pid, catalog_course_id, description, academic_level, credits, subject_code FROM courses_data WHERE catalog_course_id IS NOT NULL AND BTRIM(catalog_course_id) != '' ORDER BY catalog_course_id, pid");
    // No DISTINCT: exact duplicates are reconciled and reported by the pure transformer. External prerequisites are preserved.
    const edges = await client.query<EdgeRow>(`
      SELECT 
        parent.catalog_course_id AS parent_id, 
        parent.title AS parent_title, 
        COALESCE(prerequisite.catalog_course_id, p.course_id) AS child_id, 
        COALESCE(prerequisite.title, NULLIF(BTRIM(p.course_title), ''), p.course_id) AS child_title 
      FROM prerequisites p 
      JOIN courses_data parent ON parent.pid = p.class_id 
      LEFT JOIN (
        SELECT DISTINCT ON (UPPER(REGEXP_REPLACE(catalog_course_id, '[\\s-]+', '', 'g'))) 
          catalog_course_id, 
          title,
          UPPER(REGEXP_REPLACE(catalog_course_id, '[\\s-]+', '', 'g')) AS normalized_id
        FROM courses_data 
        WHERE catalog_course_id IS NOT NULL AND BTRIM(catalog_course_id) != '' 
        ORDER BY UPPER(REGEXP_REPLACE(catalog_course_id, '[\\s-]+', '', 'g')), pid
      ) prerequisite ON prerequisite.normalized_id = UPPER(REGEXP_REPLACE(p.course_id, '[\\s-]+', '', 'g')) 
      WHERE parent.catalog_course_id IS NOT NULL 
        AND BTRIM(parent.catalog_course_id) != '' 
        AND p.course_id IS NOT NULL 
        AND BTRIM(p.course_id) != '' 
        AND UPPER(REGEXP_REPLACE(parent.catalog_course_id, '[\\s-]+', '', 'g')) != UPPER(REGEXP_REPLACE(p.course_id, '[\\s-]+', '', 'g'))
      ORDER BY parent.catalog_course_id, COALESCE(prerequisite.catalog_course_id, p.course_id), parent.pid
    `);
    const sync = await client.query<{ completed_at: Date | string | null }>("SELECT completed_at FROM catalog_sync_state WHERE id = 'catalog'");
    const cc = coursesCoverage.rows[0];
    const pc = prerequisitesCoverage.rows[0];
    const sourceCoverage: CourseSourceCoverage = {
      coursesData: {
        totalRows: Number(cc?.total_rows ?? 0),
        candidateRows: Number(cc?.candidate_rows ?? 0),
        excluded: {
          missingCatalogCourseId: Number(cc?.missing_catalog_course_id ?? 0),
        },
      },
      prerequisites: {
        totalRows: Number(pc?.total_rows ?? 0),
        candidateRows: Number(pc?.candidate_rows ?? 0),
        excluded: {
          orphanClassId: Number(pc?.orphan_class_id ?? 0),
          parentMissingCatalogCourseId: Number(pc?.parent_missing_catalog_course_id ?? 0),
          missingPrerequisiteCourseId: Number(pc?.missing_prerequisite_course_id ?? 0),
          selfReference: Number(pc?.self_reference ?? 0),
        },
        unmatched: {
          externalPrerequisites: Number(pc?.external_prerequisites ?? 0),
        },
      },
    };
    const result = transformCourses(records.rows, edges.rows, sync.rows[0]?.completed_at ?? null, sourceCoverage);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

/** Compatibility assertion shared by exporter tests; preserves graph materialization behavior. */
export function validateCourseGraph(exported: CoursesExport) { const rootTitles = new Map(exported.summaries.map((row) => [row.catalog_course_id, row.title])); const children = new Map<string, GraphEdge[]>(); for (const edge of exported.edges) children.set(edge.parentId, [...(children.get(edge.parentId) ?? []), edge]); const build = (id: string, title: string, seen: Set<string>): CourseTree => { const prerequisites = (children.get(id) ?? []).filter((edge) => !seen.has(edge.childId)).map((edge) => build(edge.childId, edge.childTitle, new Set([...seen, edge.childId]))); return prerequisites.length ? { course_id: id, name: title, prerequisites } : { course_id: id, name: title }; }; return exported.ids.map((id) => { const title = rootTitles.get(id); return { id, tree: title === undefined ? null : build(id, title, new Set([id])) }; }); }

