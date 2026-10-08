import type { Pool } from "pg";
import type { CourseRecord, CourseSummary, GraphEdge } from "@/features/courses/lib/courses";
import type { CourseTree } from "@/features/courses/lib/courseGraphLayout";

export type CoursesExport = { meta: { domain: "courses"; counts: { ids: number; records: number; edges: number } }; ids: string[]; summaries: CourseSummary[]; records: Record<string, CourseRecord>; edges: GraphEdge[]; lastModified: string | null };
type Row = Partial<CourseRecord>;
type EdgeRow = { parent_id?: string; parent_title?: string; child_id?: string; child_title?: string };
const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "");

/** Pure transformation: safe to test without a database. */
export function transformCourses(rows: Row[], edgeRows: EdgeRow[], completedAt: Date | string | null): CoursesExport {
  const records: Record<string, CourseRecord> = {};
  for (const row of rows) { const id = normalize(row.catalog_course_id); if (!id || !row.title?.trim() || records[id]) continue; records[id] = { title: row.title, pid: String(row.pid ?? ""), catalog_course_id: id, description: row.description ?? null, academic_level: row.academic_level ?? null, credits: row.credits ?? null, subject_code: row.subject_code ?? null }; }
  const ids = Object.keys(records).sort();
  if (!ids.length) throw new Error("Refusing empty courses export");
  const summaries = ids.map((catalog_course_id) => ({ catalog_course_id, title: records[catalog_course_id].title }));
  const edges = edgeRows.map((edge) => ({ parentId: normalize(edge.parent_id), parentTitle: String(edge.parent_title ?? ""), childId: normalize(edge.child_id), childTitle: String(edge.child_title ?? "") })).filter((edge) => edge.parentId && edge.childId && edge.parentId !== edge.childId && records[edge.parentId]).sort((a,b) => `${a.parentId}\0${a.childId}`.localeCompare(`${b.parentId}\0${b.childId}`));
  const date = completedAt ? new Date(completedAt) : null;
  return { meta: { domain: "courses", counts: { ids: ids.length, records: ids.length, edges: edges.length } }, ids, summaries, records, edges, lastModified: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null };
}

/** Explicit, read-only database extraction. Caller owns and closes the bounded export pool. */
export async function exportCoursesFromDatabase(pool: Pick<Pool, "connect">): Promise<CoursesExport> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const records = await client.query<CourseRecord>("SELECT title, pid, catalog_course_id, description, academic_level, credits, subject_code FROM courses_data WHERE catalog_course_id IS NOT NULL");
    const edges = await client.query<EdgeRow>("SELECT DISTINCT parent.catalog_course_id AS parent_id, parent.title AS parent_title, prerequisite.catalog_course_id AS child_id, prerequisite.title AS child_title FROM prerequisites p JOIN courses_data parent ON parent.pid = p.class_id JOIN courses_data prerequisite ON prerequisite.catalog_course_id = p.course_id WHERE parent.catalog_course_id IS NOT NULL AND prerequisite.catalog_course_id IS NOT NULL");
    const sync = await client.query<{ completed_at: Date | string | null }>("SELECT completed_at FROM catalog_sync_state WHERE id = 'catalog'");
    await client.query("COMMIT");
    return transformCourses(records.rows, edges.rows, sync.rows[0]?.completed_at ?? null);
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

/** Compatibility assertion shared by exporter tests; preserves graph materialization behavior. */
export function validateCourseGraph(exported: CoursesExport) { const titles=new Map(exported.summaries.map(row=>[row.catalog_course_id,row.title]));const children=new Map<string,GraphEdge[]>();for(const edge of exported.edges)children.set(edge.parentId,[...(children.get(edge.parentId)??[]),edge]);const build=(id:string,seen:Set<string>):CourseTree|null=>{const title=titles.get(id);if(!title)return null;const prerequisites=(children.get(id)??[]).filter(edge=>!seen.has(edge.childId)).map(edge=>build(edge.childId,new Set([...seen,edge.childId]))).filter((node):node is CourseTree=>node!==null);return prerequisites.length?{course_id:id,name:title,prerequisites}:{course_id:id,name:title};};return exported.ids.map(id=>({id,tree:build(id,new Set([id]))})); }
