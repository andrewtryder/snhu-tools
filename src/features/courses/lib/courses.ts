import { unstable_cache } from "next/cache";
import { cache } from "react";
import { withPoolClient } from "@/features/courses/db/pool";
import type { QueryClient } from "@/features/courses/db/types";
import type { CourseTree } from "./courseGraphLayout";

// ─── Shared constants ─────────────────────────────────────────────────────────

/** Shared tag for all read-only catalog caches. Invalidate via POST /api/revalidate. */
export const CATALOG_TAG = "catalog-data";
/** 24-hour revalidation for course catalog data (changes ~bimonthly). */
export const CATALOG_TTL = 86_400;
/** 1-hour revalidation for the sync timestamp (changes on each successful sync). */
export const SYNC_STATE_TTL = 3_600;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CourseRecord {
  title: string;
  pid: string;
  catalog_course_id: string;
  description: string | null;
  academic_level: string | null;
  credits: string | null;
  subject_code: string | null;
}

export interface CourseTreeResult {
  id: string;
  tree: CourseTree | null;
}

export interface CourseSummary {
  catalog_course_id: string;
  title: string;
}

// ─── Internal DB helpers ──────────────────────────────────────────────────────

async function withDbClient<T>(fn: (client: QueryClient) => Promise<T>): Promise<T> {
  return withPoolClient(fn);
}

// ─── CTE prerequisite graph engine ───────────────────────────────────────────

/**
 * A single edge in the prerequisite graph: `parentId` requires `childId`.
 * `parentTitle` and `childTitle` are the human-readable course names.
 */
export interface GraphEdge {
  parentId: string;
  parentTitle: string;
  childId: string;
  childTitle: string;
}

/**
 * Fetches the complete prerequisite graph for all `rootIds` in two queries:
 * 1. A batch SELECT for root course titles (to handle courses with no prerequisites).
 * 2. A recursive CTE that traverses the full prerequisite graph in one round trip.
 *
 * Cycle protection is enforced inside PostgreSQL via the path array guard.
 * Returns { rootTitles, edges } — callers use `buildTreesFromGraph` to assemble trees.
 */
async function fetchPrerequisiteGraph(
  client: QueryClient,
  rootIds: string[],
): Promise<{ rootTitles: Map<string, string>; edges: GraphEdge[] }> {
  if (rootIds.length === 0) {
    return { rootTitles: new Map(), edges: [] };
  }

  const rootResult = await client.query<{ catalog_course_id: string; title: string }>(
    `SELECT catalog_course_id, title
     FROM courses_data
     WHERE catalog_course_id = ANY($1)`,
    [rootIds],
  );
  const rootTitles = new Map<string, string>(
    rootResult.rows.map((r) => [r.catalog_course_id, r.title]),
  );

  const graphResult = await client.query<{
    parent_id: string;
    parent_title: string;
    child_id: string;
    child_title: string;
  }>(
    `WITH RECURSIVE prereq_graph AS (
        -- Anchor: direct prerequisites of the requested root courses.
        SELECT
            cd_parent.catalog_course_id AS parent_id,
            cd_parent.title             AS parent_title,
            cd_child.catalog_course_id  AS child_id,
            cd_child.title              AS child_title,
            ARRAY[cd_parent.catalog_course_id] AS path
        FROM prerequisites p
        JOIN courses_data cd_parent ON cd_parent.pid = p.class_id
        JOIN courses_data cd_child  ON cd_child.catalog_course_id = p.course_id
        WHERE cd_parent.catalog_course_id = ANY($1)

        UNION ALL

        -- Recursive: one level deeper, stopping on any revisited node.
        SELECT
            g.child_id                  AS parent_id,
            g.child_title               AS parent_title,
            cd_child.catalog_course_id  AS child_id,
            cd_child.title              AS child_title,
            g.path || g.child_id
        FROM prereq_graph g
        JOIN courses_data cd_parent ON cd_parent.catalog_course_id = g.child_id
        JOIN prerequisites p         ON p.class_id = cd_parent.pid
        JOIN courses_data cd_child   ON cd_child.catalog_course_id = p.course_id
        WHERE NOT (g.child_id = ANY(g.path))
    )
    SELECT DISTINCT
        parent_id,
        parent_title,
        child_id,
        child_title
    FROM prereq_graph`,
    [rootIds],
  );

  const edges: GraphEdge[] = graphResult.rows.map((r) => ({
    parentId: r.parent_id,
    parentTitle: r.parent_title,
    childId: r.child_id,
    childTitle: r.child_title,
  }));

  return { rootTitles, edges };
}

/**
 * Assembles a `CourseTree` for `rootId` from the flat edge list.
 *
 * `seenInBranch` tracks the current branch path to detect and cut cycles that
 * PostgreSQL's path guard may not catch on shared edges returned by DISTINCT.
 * Each recursive call receives its own clone so sibling branches are unaffected
 * (this preserves shared diamond-shaped prerequisite nodes).
 */
function buildTree(
  rootId: string,
  rootTitle: string,
  edgesByParent: Map<string, GraphEdge[]>,
  seenInBranch: Set<string>,
): CourseTree {
  const tree: CourseTree = { course_id: rootId, name: rootTitle };

  const children = edgesByParent.get(rootId) ?? [];
  const prereqs: CourseTree[] = [];

  for (const edge of children) {
    if (seenInBranch.has(edge.childId)) {
      // Cycle — skip this node on this branch.
      continue;
    }
    const childBranch = new Set(seenInBranch);
    childBranch.add(edge.childId);
    prereqs.push(buildTree(edge.childId, edge.childTitle, edgesByParent, childBranch));
  }

  if (prereqs.length > 0) {
    tree.prerequisites = prereqs;
  }

  return tree;
}

/**
 * Builds the nested `CourseTree[]` from flat graph edges for each of `rootIds`.
 * Unknown root IDs (absent from `rootTitles`) produce a `null` result entry.
 */
export function buildTreesFromGraph(
  rootIds: string[],
  rootTitles: Map<string, string>,
  edges: GraphEdge[],
): CourseTreeResult[] {
  const edgesByParent = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = edgesByParent.get(edge.parentId);
    if (list) {
      list.push(edge);
    } else {
      edgesByParent.set(edge.parentId, [edge]);
    }
  }

  return rootIds.map((id) => {
    const title = rootTitles.get(id);
    if (title === undefined) {
      return { id, tree: null };
    }
    const tree = buildTree(id, title, edgesByParent, new Set([id]));
    return { id, tree };
  });
}

// ─── Uncached internal implementations ───────────────────────────────────────

async function getCourseByIdUncached(courseId: string): Promise<CourseRecord | null> {
  return withDbClient(async (client) => {
    const result = await client.query<CourseRecord>(
      `SELECT title, pid, catalog_course_id, description, academic_level, credits, subject_code
       FROM courses_data
       WHERE catalog_course_id = $1`,
      [courseId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  });
}

async function getCourseTreeUncached(courseId: string): Promise<CourseTree | null> {
  return withDbClient(async (client) => {
    const { rootTitles, edges } = await fetchPrerequisiteGraph(client, [courseId]);
    const [result] = buildTreesFromGraph([courseId], rootTitles, edges);
    return result?.tree ?? null;
  });
}

async function getCourseTreesUncached(courseIds: string[]): Promise<CourseTreeResult[]> {
  if (courseIds.length === 0) return [];
  return withDbClient(async (client) => {
    const { rootTitles, edges } = await fetchPrerequisiteGraph(client, courseIds);
    return buildTreesFromGraph(courseIds, rootTitles, edges);
  });
}

async function getAllCourseIdsUncached(): Promise<string[]> {
  return withDbClient(async (client) => {
    const result = await client.sql`
      SELECT catalog_course_id
      FROM courses_data
      WHERE catalog_course_id IS NOT NULL
      ORDER BY catalog_course_id
    `;
    return result.rows.map((row) => row.catalog_course_id as string);
  });
}

async function getAllCourseSummariesUncached(): Promise<CourseSummary[]> {
  return withDbClient(async (client) => {
    const result = await client.sql`
      SELECT catalog_course_id, title
      FROM courses_data
      WHERE catalog_course_id IS NOT NULL
      ORDER BY catalog_course_id
    `;

    const seen = new Set<string>();
    const summaries: CourseSummary[] = [];

    for (const row of result.rows) {
      const id = row.catalog_course_id as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      summaries.push({
        catalog_course_id: id,
        title: (row.title as string) ?? "",
      });
    }

    return summaries;
  });
}

async function getCatalogLastModifiedUncached(): Promise<Date | null> {
  return withDbClient(async (client) => {
    const result = await client.sql`
      SELECT completed_at
      FROM catalog_sync_state
      WHERE id = 'catalog'
    `;

    if (result.rows.length === 0) return null;

    const raw = result.rows[0].completed_at;
    if (raw == null) return null;

    const date = raw instanceof Date ? raw : new Date(raw as string);
    if (Number.isNaN(date.getTime())) return null;

    return date;
  });
}

async function getDependentCourseIdsUncached(courseId: string): Promise<string[]> {
  return withDbClient(async (client) => {
    const result = await client.sql`
      SELECT DISTINCT cd.catalog_course_id
      FROM prerequisites p
      JOIN courses_data cd ON p.class_id = cd.pid
      WHERE p.course_id = ${courseId}
        AND cd.catalog_course_id != ${courseId}
      ORDER BY cd.catalog_course_id
    `;
    return result.rows.map((row) => row.catalog_course_id as string);
  });
}

async function getDirectPrerequisiteIdsUncached(courseId: string): Promise<string[]> {
  return withDbClient(async (client) => {
    const result = await client.sql`
      SELECT prerequisites.course_id
      FROM prerequisites
      JOIN courses_data ON prerequisites.class_id = courses_data.pid
      WHERE prerequisites.class_id IN (
          SELECT pid
          FROM courses_data
          WHERE catalog_course_id = ${courseId}
      )
        AND prerequisites.course_id != ${courseId}
      ORDER BY prerequisites.course_id
    `;
    return result.rows.map((row) => row.course_id as string);
  });
}

// ─── Exported cached helpers ─────────────────────────────────────────────────

const getCourseByIdCached = unstable_cache(
  getCourseByIdUncached,
  ["course"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

const getCourseByIdRequestCached = cache((courseId: string) => getCourseByIdCached(courseId));

export function getCourseById(courseId: string): Promise<CourseRecord | null> {
  return getCourseByIdRequestCached(courseId.toUpperCase());
}

const getCourseTreeCached = unstable_cache(
  getCourseTreeUncached,
  ["course-tree"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

const getCourseTreeRequestCached = cache((courseId: string) => getCourseTreeCached(courseId));

export function getCourseTree(courseId: string): Promise<CourseTree | null> {
  return getCourseTreeRequestCached(courseId.toUpperCase());
}

const getCourseTreesCached = unstable_cache(
  getCourseTreesUncached,
  ["course-trees"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

export function getCourseTrees(courseIds: string[]): Promise<CourseTreeResult[]> {
  const requestedIds = courseIds.map((id) => id.toUpperCase());
  const canonicalIds = [...new Set(requestedIds)].sort();

  return getCourseTreesCached(canonicalIds).then((canonicalResults) => {
    const resultsById = new Map(canonicalResults.map((result) => [result.id, result]));
    return requestedIds.map((id) => resultsById.get(id) ?? { id, tree: null });
  });
}

const getAllCourseIdsCached = unstable_cache(
  getAllCourseIdsUncached,
  ["course-ids"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

export async function getAllCourseIds(): Promise<string[]> {
  try {
    return await getAllCourseIdsCached();
  } catch (error) {
    console.warn("Could not fetch course IDs for static generation:", error);
    return [];
  }
}

const getAllCourseSummariesCached = unstable_cache(
  getAllCourseSummariesUncached,
  ["course-summaries"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

export async function getAllCourseSummaries(): Promise<CourseSummary[]> {
  try {
    return await getAllCourseSummariesCached();
  } catch (error) {
    console.warn("Could not fetch course summaries for directory:", error);
    return [];
  }
}

const getCatalogLastModifiedCached = unstable_cache(
  getCatalogLastModifiedUncached,
  ["catalog-last-modified"],
  { tags: [CATALOG_TAG], revalidate: SYNC_STATE_TTL },
);

export async function getCatalogLastModified(): Promise<Date | null> {
  try {
    return await getCatalogLastModifiedCached();
  } catch (error) {
    console.warn("Could not fetch catalog last-modified timestamp:", error);
    return null;
  }
}

export function getSitemapCatalogData(): Promise<{
  courseIds: string[];
  catalogLastModified: Date | null;
}> {
  return Promise.all([getAllCourseIdsCached(), getCatalogLastModifiedCached()]).then(
    ([courseIds, catalogLastModified]) => ({ courseIds, catalogLastModified }),
  );
}

const getDependentCourseIdsCached = unstable_cache(
  getDependentCourseIdsUncached,
  ["course-dependents"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

const getDependentCourseIdsRequestCached = cache((courseId: string) =>
  getDependentCourseIdsCached(courseId),
);

export function getDependentCourseIds(courseId: string): Promise<string[]> {
  return getDependentCourseIdsRequestCached(courseId.toUpperCase());
}

const getDirectPrerequisiteIdsCached = unstable_cache(
  getDirectPrerequisiteIdsUncached,
  ["course-direct-prereqs"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

const getDirectPrerequisiteIdsRequestCached = cache((courseId: string) =>
  getDirectPrerequisiteIdsCached(courseId),
);

export function getDirectPrerequisiteIds(courseId: string): Promise<string[]> {
  return getDirectPrerequisiteIdsRequestCached(courseId.toUpperCase());
}
