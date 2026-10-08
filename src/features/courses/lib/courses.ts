import { getStaticSnapshot } from "@/lib/staticSnapshots";
import type { CourseTree } from "./courseGraphLayout";

export const CATALOG_TAG = "catalog-data";
export const CATALOG_TTL = 86_400;
export const SYNC_STATE_TTL = 3_600;
export interface CourseRecord { title: string; pid: string; catalog_course_id: string; description: string | null; academic_level: string | null; credits: string | null; subject_code: string | null; }
export interface CourseTreeResult { id: string; tree: CourseTree | null; }
export interface CourseSummary { catalog_course_id: string; title: string; }
export interface CourseDetailPageData { course: CourseRecord | null; tree: CourseTree | null; directPrereqs: string[]; dependents: string[]; }
export interface GraphEdge { parentId: string; parentTitle: string; childId: string; childTitle: string; }
type CoursesBundle = { ids: string[]; summaries: CourseSummary[]; records: Record<string, CourseRecord>; edges: GraphEdge[]; lastModified: string | null } & { meta: { domain: "courses"; counts: Record<string, number> } };

export function buildTreesFromGraph(rootIds: string[], rootTitles: Map<string, string>, edges: GraphEdge[]): CourseTreeResult[] {
  const children = new Map<string, GraphEdge[]>();
  for (const edge of edges) children.set(edge.parentId.toUpperCase(), [...(children.get(edge.parentId.toUpperCase()) ?? []), edge]);
  const build = (id: string, title: string, seen: Set<string>): CourseTree => ({ course_id: id, name: title, prerequisites: (children.get(id) ?? []).filter((edge) => !seen.has(edge.childId.toUpperCase())).map((edge) => build(edge.childId.toUpperCase(), edge.childTitle, new Set([...seen, edge.childId.toUpperCase()]))) });
  return rootIds.map((raw) => { const id = raw.toUpperCase(); const title = rootTitles.get(id); return { id, tree: title === undefined ? null : build(id, title, new Set([id])) }; });
}
function bundle(): CoursesBundle { return getStaticSnapshot<CoursesBundle>("courses"); }
function trees(ids: string[]): CourseTreeResult[] { const data = bundle(); const titles = new Map(data.summaries.map((course) => [course.catalog_course_id.toUpperCase(), course.title])); return buildTreesFromGraph(ids.map((id) => id.toUpperCase()), titles, data.edges.map((edge) => ({ ...edge, parentId: edge.parentId.toUpperCase(), childId: edge.childId.toUpperCase() }))); }
export async function getCourseById(id: string) { return bundle().records[id.toUpperCase()] ?? null; }
export async function getCourseTree(id: string) { return trees([id])[0]?.tree ?? null; }
export async function getCourseTrees(ids: string[]) { return trees(ids); }
export async function getAllCourseIds() { return [...bundle().ids]; }
export async function getAllCourseSummaries() { return [...bundle().summaries]; }
export async function getCatalogLastModified() { const raw = bundle().lastModified; return raw ? new Date(raw) : null; }
export async function getSitemapCatalogData() { return { courseIds: await getAllCourseIds(), catalogLastModified: await getCatalogLastModified() }; }
export async function getDependentCourseIds(id: string) { const target = id.toUpperCase(); return bundle().edges.filter((edge) => edge.childId.toUpperCase() === target).map((edge) => edge.parentId.toUpperCase()).sort(); }
export async function getDirectPrerequisiteIds(id: string) { const target = id.toUpperCase(); return bundle().edges.filter((edge) => edge.parentId.toUpperCase() === target).map((edge) => edge.childId.toUpperCase()).sort(); }
export async function getCourseDetailPageData(id: string): Promise<CourseDetailPageData> { const key = id.toUpperCase(); return { course: await getCourseById(key), tree: await getCourseTree(key), directPrereqs: await getDirectPrerequisiteIds(key), dependents: await getDependentCourseIds(key) }; }
