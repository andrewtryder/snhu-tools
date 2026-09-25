import { withPoolClient } from "@/features/courses/db/pool";
import type { QueryClient } from "@/features/courses/db/types";
import type { CourseTree } from "@/features/courses/lib/courseGraphLayout";
import {
  buildTreesFromGraph,
  type CourseRecord,
  type CourseSummary,
  type GraphEdge,
} from "@/features/courses/lib/courses";
import { createSnapshotVersion } from "../paths";
import { publishDomainSnapshot } from "../manifest";
import type { SnapshotMeta } from "../types";

export interface CourseSnapshotEdge {
  parentId: string;
  childId: string;
  parentTitle?: string;
  childTitle?: string;
}

export interface CoursesSnapshotBundle {
  meta: SnapshotMeta;
  summaries: CourseSummary[];
  ids: string[];
  records: Record<string, CourseRecord>;
  edges: CourseSnapshotEdge[];
  trees: Record<string, CourseTree | null>;
  dependents: Record<string, string[]>;
  directPrereqs: Record<string, string[]>;
  lastModified: string | null;
}

function assertDbConfigured(): void {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is required to build course snapshots");
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Load all direct prerequisite edges once; trees are assembled in JS. */
async function fetchAllDirectEdges(
  client: QueryClient,
): Promise<GraphEdge[]> {
  const graphResult = await client.query<{
    parent_id: string;
    parent_title: string;
    child_id: string;
    child_title: string;
  }>(
    `
    SELECT DISTINCT
      cd_parent.catalog_course_id AS parent_id,
      cd_parent.title             AS parent_title,
      cd_child.catalog_course_id  AS child_id,
      cd_child.title              AS child_title
    FROM prerequisites p
    JOIN courses_data cd_parent ON cd_parent.pid = p.class_id
    JOIN courses_data cd_child  ON cd_child.catalog_course_id = p.course_id
    WHERE cd_parent.catalog_course_id IS NOT NULL
      AND cd_child.catalog_course_id IS NOT NULL
    `,
  );

  return graphResult.rows.map((r) => ({
    parentId: r.parent_id,
    parentTitle: r.parent_title,
    childId: r.child_id,
    childTitle: r.child_title,
  }));
}

/** Rebuild a single course tree from a stored edges dump. */
export function materializeTree(
  courseId: string,
  edges: CourseSnapshotEdge[],
  titleById?: Record<string, string>,
): CourseTree | null {
  const id = courseId.toUpperCase();
  const rootTitles = new Map<string, string>();
  if (titleById) {
    for (const [k, v] of Object.entries(titleById)) rootTitles.set(k.toUpperCase(), v);
  }
  for (const edge of edges) {
    if (edge.parentTitle) rootTitles.set(edge.parentId.toUpperCase(), edge.parentTitle);
    if (edge.childTitle) rootTitles.set(edge.childId.toUpperCase(), edge.childTitle);
  }

  const title = rootTitles.get(id);
  if (title === undefined) return null;

  const graphEdges: GraphEdge[] = edges.map((e) => ({
    parentId: e.parentId.toUpperCase(),
    parentTitle: e.parentTitle ?? rootTitles.get(e.parentId.toUpperCase()) ?? e.parentId,
    childId: e.childId.toUpperCase(),
    childTitle: e.childTitle ?? rootTitles.get(e.childId.toUpperCase()) ?? e.childId,
  }));

  const [result] = buildTreesFromGraph([id], new Map([[id, title]]), graphEdges);
  return result?.tree ?? null;
}

export async function buildCoursesSnapshotFromDatabase(): Promise<CoursesSnapshotBundle> {
  assertDbConfigured();

  return withPoolClient(async (client) => {
    const summariesResult = await client.sql`
      SELECT catalog_course_id, title
      FROM courses_data
      WHERE catalog_course_id IS NOT NULL
      ORDER BY catalog_course_id
    `;

    const seen = new Set<string>();
    const summaries: CourseSummary[] = [];
    for (const row of summariesResult.rows) {
      const id = row.catalog_course_id as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      summaries.push({
        catalog_course_id: id,
        title: (row.title as string) ?? "",
      });
    }

    if (summaries.length === 0) {
      throw new Error("Refusing to build courses snapshot: summaries are empty");
    }

    const ids = summaries.map((s) => s.catalog_course_id);

    const recordsResult = await client.query<CourseRecord>(
      `SELECT title, pid, catalog_course_id, description, academic_level, credits, subject_code
       FROM courses_data
       WHERE catalog_course_id IS NOT NULL`,
    );
    const records: Record<string, CourseRecord> = {};
    for (const row of recordsResult.rows) {
      if (!row.catalog_course_id) continue;
      records[row.catalog_course_id] = row;
    }

    const graphEdges = await fetchAllDirectEdges(client);
    const edges: CourseSnapshotEdge[] = graphEdges.map((e) => ({
      parentId: e.parentId,
      childId: e.childId,
      parentTitle: e.parentTitle,
      childTitle: e.childTitle,
    }));

    const rootTitles = new Map<string, string>(
      summaries.map((s) => [s.catalog_course_id, s.title]),
    );
    const treeResults = buildTreesFromGraph(ids, rootTitles, graphEdges);
    const trees: Record<string, CourseTree | null> = {};
    for (const result of treeResults) {
      trees[result.id] = result.tree;
    }

    const relResult = await client.query<{
      parent_id: string;
      child_id: string;
    }>(
      `
      SELECT DISTINCT
        cd_parent.catalog_course_id AS parent_id,
        p.course_id AS child_id
      FROM prerequisites p
      JOIN courses_data cd_parent ON cd_parent.pid = p.class_id
      WHERE cd_parent.catalog_course_id IS NOT NULL
        AND p.course_id IS NOT NULL
        AND cd_parent.catalog_course_id != p.course_id
      `,
    );

    const directPrereqs: Record<string, string[]> = {};
    const dependents: Record<string, string[]> = {};
    for (const id of ids) {
      directPrereqs[id] = [];
      dependents[id] = [];
    }

    for (const row of relResult.rows) {
      const parent = row.parent_id;
      const child = row.child_id;
      if (!parent || !child || parent === child) continue;
      if (directPrereqs[parent]) {
        directPrereqs[parent].push(child);
      } else {
        directPrereqs[parent] = [child];
      }
      if (dependents[child]) {
        dependents[child].push(parent);
      } else {
        dependents[child] = [parent];
      }
    }

    for (const id of Object.keys(directPrereqs)) {
      directPrereqs[id] = [...new Set(directPrereqs[id])].sort();
    }
    for (const id of Object.keys(dependents)) {
      dependents[id] = [...new Set(dependents[id])].sort();
    }

    const lastModResult = await client.sql`
      SELECT completed_at
      FROM catalog_sync_state
      WHERE id = 'catalog'
    `;
    const raw = lastModResult.rows[0]?.completed_at;
    const lastModified = toIso(raw as Date | string | null | undefined);

    const version = createSnapshotVersion("courses");
    const publishedAt = new Date().toISOString();

    return {
      meta: {
        domain: "courses",
        version,
        publishedAt,
        sourceUpdatedAt: lastModified,
        counts: {
          summaries: summaries.length,
          ids: ids.length,
          records: Object.keys(records).length,
          edges: edges.length,
          trees: Object.keys(trees).length,
        },
      },
      summaries,
      ids,
      records,
      edges,
      trees,
      dependents,
      directPrereqs,
      lastModified,
    };
  });
}

export function validateCoursesBundle(bundle: CoursesSnapshotBundle): void {
  if (!bundle?.meta || bundle.meta.domain !== "courses") {
    throw new Error("Invalid courses snapshot: missing meta");
  }
  if (!Array.isArray(bundle.summaries) || bundle.summaries.length === 0) {
    throw new Error("Invalid courses snapshot: summaries must be non-empty");
  }
  if (!Array.isArray(bundle.ids) || bundle.ids.length === 0) {
    throw new Error("Invalid courses snapshot: ids must be non-empty");
  }
}

export async function publishCoursesSnapshot(): Promise<{
  version: string;
  counts: { summaries: number; ids: number };
}> {
  const bundle = await buildCoursesSnapshotFromDatabase();
  const { version } = await publishDomainSnapshot({
    domain: "courses",
    bundle,
    validate: validateCoursesBundle,
    sourceUpdatedAt: bundle.lastModified,
    counts: { courses: bundle.summaries.length },
  });
  return {
    version,
    counts: {
      summaries: bundle.summaries.length,
      ids: bundle.ids.length,
    },
  };
}
