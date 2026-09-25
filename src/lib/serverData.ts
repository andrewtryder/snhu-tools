import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { Pool } from "pg";
import { getPool } from "@/lib/db/pool";
import {
  DegreeProgram,
  CourseNodeData,
  PrerequisiteEdgeData,
  RequirementGroup,
  RequirementItem,
  RequirementRuleMetadata,
  GroupCategory,
  DegreeLevel,
} from "@/types/program";
import { fixturePrograms, getProgramBySlug as getFixtureBySlug } from "@/data/fixturePrograms";
import { CATEGORY_PALETTES } from "@/lib/graphLayout";
import { normalizeDegreeLevel } from "@/lib/kualiParser";
import { getCourseCodeKey, getCourseNodeId, normalizeCourseCode } from "@/lib/courseCode";
import { resolvePublicCatalogUrl } from "@/lib/snhuCatalog";
import { rankRelatedPrograms, type RelatedProgramCandidate } from "@/lib/relatedPrograms";
import type { ProgramsSnapshotBundle } from "@/lib/snapshots/domains/programs";
import { readThroughSnapshot } from "@/lib/snapshots/readThrough";
import { searchProgramsFromSnapshot } from "@/lib/search/snapshotSearch";

function getDbPool(): Pool | null {
  if (!process.env.POSTGRES_URL) {
    return null;
  }

  if ((process.env.NODE_ENV === "test" || process.env.VITEST) && process.env.TEST_WITH_LIVE_DB !== "true") {
    return null;
  }

  try {
    return getPool();
  } catch {
    return null;
  }
}

function isFixturesEnabled(): boolean {
  if (process.env.NODE_ENV === "test" && process.env.ENABLE_PROGRAM_FIXTURES !== "false") {
    return true;
  }
  // Never use fixtures as a production outage fallback.
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_PROGRAM_FIXTURES === "true";
}

/**
 * Next data-cache wrapper. On cache infrastructure failure, re-run the callback
 * once — callbacks are snapshot-first, so a durable snapshot is served without
 * waking Postgres when one exists. Do not wrap raw DB-only loaders here.
 */
async function safeCache<T>(
  cb: () => Promise<T>,
  keyParts: string[],
  options: { tags?: string[] }
): Promise<T> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return await cb();
  }
  try {
    return await unstable_cache(cb, keyParts, { ...options, revalidate: false })();
  } catch (error) {
    console.error("[safeCache] unstable_cache failed; retrying snapshot-first callback", {
      keyParts,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return await cb();
  }
}

/** Snapshot-only programs bundle; request path never runs the full publish builder. */
async function loadProgramsSnapshotBundle(): Promise<ProgramsSnapshotBundle | null> {
  const result = await readThroughSnapshot<ProgramsSnapshotBundle>({
    domain: "programs",
    cacheKey: "programs.bundle",
    preferSnapshot: true,
    loadFromDatabase: async () =>
      ({ directory: [] }) as unknown as ProgramsSnapshotBundle,
    fromBundle: (b) => b as ProgramsSnapshotBundle,
    validate: (b) => Array.isArray(b?.directory) && b.directory.length > 0,
  });
  return result.value;
}

function summaryToDegreeProgram(summary: ProgramsSnapshotBundle["directory"][number]): DegreeProgram {
  return {
    slug: summary.slug,
    title: summary.title,
    degreeLevel: summary.degreeLevel,
    credential: summary.credential,
    catalogYear: summary.catalogYear || "2025-2026",
    totalCredits: summary.totalCredits ?? null,
    requiredCourseCount: summary.requiredCourseCount,
    electiveCredits: null,
    estimatedDuration: "Not available",
    sourceCatalogUrl: summary.sourceCatalogUrl,
    sourceName: "SNHU Academic Catalog",
    description: summary.description || "",
    groups: [],
    nodes: [],
    edges: [],
  };
}

/** Rehydrate dates after `unstable_cache` JSON serialization (Dates become strings). */
function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDateString(value: Date | string | null | undefined): string | undefined {
  const date = asDate(value);
  return date ? date.toISOString() : undefined;
}

export interface ProgramSummary {
  slug: string;
  title: string;
  degreeLevel: DegreeLevel;
  credential: string;
  catalogYear: string;
  totalCredits: number | null;
  requiredCourseCount: number;
  description: string;
  sourceCatalogUrl: string | null;
}

export const getPrograms = cache(
  async (options?: { level?: string; year?: string }): Promise<DegreeProgram[]> => {
    return safeCache(
      async () => {
        const bundle = await loadProgramsSnapshotBundle();
        if (bundle) {
          const programs = bundle.directory.map(summaryToDegreeProgram);
          return filterFixtures(options, programs);
        }

        const pool = getDbPool();
        if (!pool) {
          return isFixturesEnabled() ? filterFixtures(options) : [];
        }

        try {
          const client = await pool.connect();
          try {
            const res = await client.query<{
              id: string;
              sourcePid: string | null;
              slug: string;
              title: string;
              credential: string;
              catalogYear: string;
              totalCredits: number | null;
              description: string;
              requiredCourseCount: string;
            }>(
              `
              SELECT
                p.id,
                p.source_pid as "sourcePid",
                p.slug,
                p.title,
                p.credential,
                c.year_label as "catalogYear",
                p.total_credits as "totalCredits",
                p.description_summary as description,
                (
                  (SELECT COUNT(DISTINCT prc2.course_code)
                   FROM program_requirement_courses prc2
                   JOIN program_requirement_groups prg2 ON prc2.requirement_group_id = prg2.id
                   WHERE prg2.program_id = p.id AND prc2.is_optional = false AND (prg2.rule_type IS NULL OR prg2.rule_type = 'all_of')
                  ) +
                  COALESCE((SELECT SUM(prg3.minimum_selections)
                   FROM program_requirement_groups prg3
                   WHERE prg3.program_id = p.id AND prg3.rule_type = 'choose_n'
                  ), 0)
                )::text as "requiredCourseCount"
              FROM programs p
              JOIN catalogs c ON p.catalog_id = c.id
              ORDER BY p.title ASC;
            `
            );

            if (res.rows.length === 0) {
              if (isFixturesEnabled()) return filterFixtures(options);
              return [];
            }

            const programs: DegreeProgram[] = res.rows.map((row) => ({
              slug: row.slug,
              title: row.title,
              degreeLevel: normalizeDegreeLevel(row.credential),
              credential: row.credential,
              catalogYear: row.catalogYear || "2025-2026",
              totalCredits: row.totalCredits ?? null,
              requiredCourseCount: parseInt(row.requiredCourseCount, 10) || 0,
              electiveCredits: null,
              estimatedDuration: "Not available",
              sourcePid: row.sourcePid?.trim() || undefined,
              sourceCatalogUrl: resolvePublicCatalogUrl(row.sourcePid),
              sourceName: "SNHU Academic Catalog",
              description: row.description || "",
              groups: [],
              nodes: [],
              edges: [],
            }));

            return filterFixtures(options, programs);
          } finally {
            client.release();
          }
        } catch (err) {
          if (isFixturesEnabled()) return filterFixtures(options);
          // Provider outages/quota must not fail static generation or request handling.
          // Snapshot path above already tried; production never falls back to fixtures.
          console.error("[getPrograms] database query failed", err);
          return [];
        }
      },
      ["get-all-programs-summaries", JSON.stringify(options || {})],
      { tags: ["program-data"] }
    );
  }
);

export const getProgramBySlug = cache(
  async (slug: string): Promise<DegreeProgram | null> => {
    return safeCache(
      async () => {
        const bundle = await loadProgramsSnapshotBundle();
        if (bundle) {
          return bundle.bySlug?.[slug] ?? null;
        }

        const pool = getDbPool();
        if (!pool) {
          return isFixturesEnabled() ? getFixtureBySlug(slug) || null : null;
        }

        try {
          const client = await pool.connect();
          try {
            const progRes = await client.query<{
              id: string;
              sourcePid: string | null;
              slug: string;
              title: string;
              credential: string;
              catalogYear: string;
              totalCredits: number | null;
              description: string;
            }>(
              `
              SELECT
                p.id,
                p.source_pid as "sourcePid",
                p.slug,
                p.title,
                p.credential,
                c.year_label as "catalogYear",
                p.total_credits as "totalCredits",
                p.description_summary as description
              FROM programs p
              JOIN catalogs c ON p.catalog_id = c.id
              WHERE p.slug = $1
              LIMIT 1;
            `,
              [slug]
            );

            if (progRes.rows.length === 0) {
              if (isFixturesEnabled()) return getFixtureBySlug(slug) || null;
              return null;
            }

            const p = progRes.rows[0];

            const groupsRes = await client.query<{
              id: string;
              parent_group_id: string | null;
              title: string;
              category: string;
              rule_type: string;
              minimum_selections: number | null;
              maximum_selections: number | null;
              minimum_credits: number | null;
              raw_excerpt: string | null;
              rule_metadata: RequirementRuleMetadata | null;
            }>(
              `
              SELECT id, parent_group_id, title, category, rule_type, minimum_selections, maximum_selections, minimum_credits, raw_excerpt, rule_metadata
              FROM program_requirement_groups
              WHERE program_id = $1
              ORDER BY sort_order ASC;
            `,
              [p.id]
            );

            const nodesMap = new Map<string, CourseNodeData>();
            const unparsedNotes: string[] = [];

            const groupDataMap = new Map<
              string,
              {
                id: string;
                parent_group_id: string | null;
                title: string;
                category: GroupCategory;
                rule_type: string;
                minimum_selections: number | null;
                maximum_selections: number | null;
                minimum_credits: number | null;
                raw_excerpt: string | null;
                rule_metadata: RequirementRuleMetadata | null;
                items: RequirementItem[];
              }
            >();

            for (const gRow of groupsRes.rows) {
              const cat = (gRow.category as GroupCategory) || "core";

              const reqCoursesRes = await client.query<{
                id: string;
                source_pid: string | null;
                course_code: string;
                title: string;
                credits: number | null;
                is_optional: boolean;
                resolution_status: CourseNodeData["resolutionStatus"] | null;
              }>(
                `
                SELECT prc.id, prc.source_pid, prc.course_code, prc.title, prc.credits, prc.is_optional,
                       dc.resolution_status
                FROM program_requirement_courses prc
                LEFT JOIN degree_courses dc ON dc.course_code = prc.course_code
                WHERE requirement_group_id = $1
                ORDER BY prc.sort_order ASC;
              `,
                [gRow.id]
              );

              const textReqsRes = await client.query<{ text: string; source_path: string; is_unparsed: boolean }>(
                `
                SELECT text, source_path, is_unparsed FROM program_text_requirements
                WHERE requirement_group_id = $1
                ORDER BY sort_order ASC;
              `,
                [gRow.id]
              );

              const items: RequirementItem[] = [];

              for (const c of reqCoursesRes.rows) {
                let itemType: RequirementItem["type"] = "single";
                if (gRow.rule_type === "choose_n" || gRow.rule_type === "choose_credits") {
                  itemType = "choice";
                } else if (gRow.rule_type === "free_elective" || gRow.rule_type === "elective") {
                  itemType = "elective";
                }

                let desc: string | undefined = undefined;
                if (c.is_optional) desc = "Optional Course";

                items.push({
                  id: c.id,
                  type: itemType,
                  title: `${c.course_code}: ${c.title}`,
                  credits: c.credits,
                  description: desc,
                });

                const code = normalizeCourseCode(c.course_code);
                if (!nodesMap.has(code)) {
                  nodesMap.set(code, {
                    id: getCourseNodeId(code),
                    code,
                    title: c.title,
                    credits: c.credits,
                    groupCode: gRow.id,
                    groupName: gRow.title,
                    groupCategory: cat,
                    prerequisites: [],
                    corequisites: [],
                    resolutionStatus: c.resolution_status || "unavailable",
                  });
                }
              }

              for (const t of textReqsRes.rows) {
                const textKind = t.is_unparsed
                  ? "unparsed"
                  : /\bpolicy\b|must meet|eligibility/i.test(t.text)
                    ? "policy"
                    : "informational";
                items.push({
                  id: `txt_${items.length}`,
                  type: "single",
                  title: t.text,
                  credits: null,
                  isUnparsed: t.is_unparsed,
                  sourceText: t.text,
                  textKind,
                });
                if (t.is_unparsed) unparsedNotes.push(t.text);
              }

              groupDataMap.set(gRow.id, {
                id: gRow.id,
                parent_group_id: gRow.parent_group_id,
                title: gRow.title,
                category: cat,
                rule_type: gRow.rule_type,
                minimum_selections: gRow.minimum_selections,
                maximum_selections: gRow.maximum_selections,
                minimum_credits: gRow.minimum_credits,
                raw_excerpt: gRow.raw_excerpt,
                rule_metadata: gRow.rule_metadata,
                items,
              });
            }

            for (const gData of Array.from(groupDataMap.values())) {
              if (gData.parent_group_id && groupDataMap.has(gData.parent_group_id)) {
                const parent = groupDataMap.get(gData.parent_group_id)!;
                parent.items.push({
                  id: gData.id,
                  type: "group",
                  title: gData.title,
                  credits: gData.minimum_credits,
                  subItems: gData.items,
                  ruleType: gData.rule_type,
                  minimumSelections: gData.minimum_selections,
                  maximumSelections: gData.maximum_selections,
                  minimumCredits: gData.minimum_credits,
                  ruleMetadata: gData.rule_metadata || undefined,
                  sourceText: gData.raw_excerpt || undefined,
                });
              }
            }

            const topLevelGroups: RequirementGroup[] = [];
            for (const gData of Array.from(groupDataMap.values())) {
              if (!gData.parent_group_id) {
                const palette = CATEGORY_PALETTES[gData.category] || CATEGORY_PALETTES.core;

                let totalCreds: number | null = gData.minimum_credits;
                if (totalCreds == null && gData.items.length > 0) {
                  let groupSum = 0;
                  let hasUnknown = false;
                  for (const item of gData.items) {
                    if (item.credits == null) {
                      hasUnknown = true;
                      break;
                    }
                    groupSum += item.credits;
                  }
                  totalCreds = !hasUnknown && groupSum > 0 ? groupSum : null;
                }

                topLevelGroups.push({
                  id: gData.id,
                  title: gData.title,
                  category: gData.category,
                  totalCredits: totalCreds,
                  ruleType: gData.rule_type,
                  minimumSelections: gData.minimum_selections,
                  maximumSelections: gData.maximum_selections,
                  minimumCredits: gData.minimum_credits,
                  ruleMetadata: gData.rule_metadata || undefined,
                  sourceText: gData.raw_excerpt || undefined,
                  items: gData.items,
                  colorTheme: {
                    bg: palette.bg,
                    border: palette.border,
                    text: "text-slate-900",
                    badgeBg: palette.badgeBg,
                    badgeText: palette.badgeText,
                  },
                });
              }
            }

            const requiredCourseCount = nodesMap.size;
            const targetNodesArr = Array.from(nodesMap.keys());
            let edgesRes: { rows: Array<{ source_course_code: string; target_course_code: string; relationship_type: string; source_text: string | null; source_title: string | null; source_credits: number | null; source_resolution_status: CourseNodeData["resolutionStatus"] | null }> } = { rows: [] };
            
            if (targetNodesArr.length > 0) {
              edgesRes = await client.query<{
                source_course_code: string;
                target_course_code: string;
                relationship_type: string;
                source_text: string | null;
                source_title: string | null;
                source_credits: number | null;
                source_resolution_status: CourseNodeData["resolutionStatus"] | null;
              }>(
                `
                SELECT e.source_course_code, e.target_course_code, e.relationship_type, e.source_text,
                       c.title as source_title, c.credits as source_credits,
                       c.resolution_status as source_resolution_status
                FROM degree_course_edges e
                LEFT JOIN degree_courses c ON e.source_course_code = c.course_code
                WHERE e.target_course_code = ANY($1::text[])
                `,
                [targetNodesArr]
              );
            }

            const edges: PrerequisiteEdgeData[] = [];
            for (const eRow of edgesRes.rows) {
              const sourceCode = normalizeCourseCode(eRow.source_course_code);
              const targetCode = normalizeCourseCode(eRow.target_course_code);
              const srcId = getCourseNodeId(sourceCode);
              const tgtId = getCourseNodeId(targetCode);

              const targetNode = nodesMap.get(targetCode);
              let sourceNode = nodesMap.get(sourceCode);

              if (targetNode) {
                if (!sourceNode) {
                  sourceNode = {
                    id: srcId,
                    code: sourceCode,
                    title: eRow.source_title || "External Requirement",
                    credits: eRow.source_credits,
                    groupCode: "external",
                    groupName: "External Prerequisites",
                    groupCategory: "other",
                    prerequisites: [],
                    corequisites: [],
                    isExternal: true,
                    resolutionStatus: eRow.source_resolution_status || "unavailable",
                  };
                  nodesMap.set(sourceCode, sourceNode);
                }

                if (eRow.relationship_type === "prerequisite" && !targetNode.prerequisites?.includes(srcId)) {
                  targetNode.prerequisites = [...(targetNode.prerequisites || []), srcId];
                }
                
                if (eRow.relationship_type === "corequisite") {
                  if (!targetNode.corequisites?.includes(srcId)) {
                    targetNode.corequisites = [...(targetNode.corequisites || []), srcId];
                  }
                }

                edges.push({
                  id: `e_${srcId}_${tgtId}_${eRow.relationship_type}`,
                  source: srcId,
                  target: tgtId,
                  type: eRow.relationship_type === "corequisite" ? "corequisite" : "prerequisite",
                  label: eRow.source_text || undefined,
                });
              }
            }

            const nodes = Array.from(nodesMap.values());
            const degreeLevel = normalizeDegreeLevel(p.credential);

          return {
            slug: p.slug,
            title: p.title,
            degreeLevel,
            credential: p.credential,
            catalogYear: p.catalogYear || "2025-2026",
            totalCredits: p.totalCredits ?? null,
            requiredCourseCount,
            electiveCredits: null,
            estimatedDuration: "Not available",
            sourcePid: p.sourcePid?.trim() || undefined,
            sourceCatalogUrl: resolvePublicCatalogUrl(p.sourcePid),
            sourceName: "SNHU Academic Catalog",
            description: p.description || "",
            careerPaths: undefined,
            groups: topLevelGroups,
            nodes,
            edges,
            unparsedRequirements: unparsedNotes.length > 0 ? unparsedNotes : undefined,
          };
          } finally {
            client.release();
          }
        } catch (err) {
          if (isFixturesEnabled()) return getFixtureBySlug(slug) || null;
          console.error("[getProgramBySlug] database query failed", err);
          return null;
        }
      },
      ["get-program-by-slug", slug],
      { tags: ["program-data"] }
    );
  }
);

export const searchPrograms = async (
  query: string,
  options?: { limit?: number; level?: string }
): Promise<Array<{ slug: string; title: string; credential: string; degreeLevel: string; matchedText?: string }>> => {
  const q = query.trim();
  const limit = options?.limit ? Math.min(options.limit, 30) : 15;
  const courseCodeKey = getCourseCodeKey(q);

  if (q.length < 2) return [];

  const fromSnapshot = await searchProgramsFromSnapshot(q, { limit, level: options?.level });
  if (fromSnapshot) return fromSnapshot;

  const pool = getDbPool();
  if (!pool) {
    if (!isFixturesEnabled()) return [];
    const all = await getPrograms(options);
    const matched = all.filter(
      (p) =>
        p.title.toLowerCase().includes(q.toLowerCase()) ||
        p.credential.toLowerCase().includes(q.toLowerCase()) ||
        p.slug.toLowerCase().includes(q.toLowerCase())
    );
    return matched.slice(0, limit).map((p) => ({
      slug: p.slug,
      title: p.title,
      credential: p.credential,
      degreeLevel: p.degreeLevel,
      matchedText: p.title,
    }));
  }

  try {
    const client = await pool.connect();
    try {
      const escaped = q.replace(/[%_\\]/g, "\\$&");
      const pattern = `%${escaped}%`;

      let levelFilter = "";
      const queryParams: (string | number)[] = [pattern, courseCodeKey, limit];
      if (options?.level && options.level !== "ALL") {
        queryParams.push(options.level);
        levelFilter = `AND p.credential ILIKE $4`;
      }

      const res = await client.query<{
        slug: string;
        title: string;
        credential: string;
      }>(
        `
        SELECT DISTINCT
          p.slug,
          p.title,
          p.credential
        FROM programs p
        LEFT JOIN program_requirement_groups prg ON prg.program_id = p.id
        LEFT JOIN program_requirement_courses prc ON prc.requirement_group_id = prg.id
        WHERE (
          p.title ILIKE $1 ESCAPE '\\'
          OR p.credential ILIKE $1 ESCAPE '\\'
          OR p.slug ILIKE $1 ESCAPE '\\'
          OR prc.course_code ILIKE $1 ESCAPE '\\'
          OR prc.title ILIKE $1 ESCAPE '\\'
          OR regexp_replace(upper(prc.course_code), '[^A-Z0-9]', '', 'g') = $2
        ) ${levelFilter}
        ORDER BY p.title ASC
        LIMIT $3;
      `,
        queryParams
      );

      return res.rows.map((row) => ({
        slug: row.slug,
        title: row.title,
        credential: row.credential,
        degreeLevel: normalizeDegreeLevel(row.credential),
        matchedText: row.title,
      }));
    } finally {
      client.release();
    }
  } catch (err) {
    if (isFixturesEnabled()) return [];
    console.error("[searchPrograms] database query failed", err);
    return [];
  }
};

export const getCatalogYears = cache(async (): Promise<string[]> => {
  const bundle = await loadProgramsSnapshotBundle();
  if (bundle?.catalogYears?.length) {
    return bundle.catalogYears;
  }

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const res = await client.query<{ year_label: string }>(
          "SELECT DISTINCT year_label FROM catalogs WHERE is_active = true ORDER BY year_label DESC;"
        );
        if (res.rows.length > 0) return res.rows.map((r) => r.year_label);
      } finally {
        client.release();
      }
    } catch {
      // fallback
    }
  }
  return ["2025-2026"];
});

export const getPopularPrograms = cache(async (): Promise<DegreeProgram[]> => {
  const all = await getPrograms();
  return all.slice(0, 3);
});

export const getProgramsForCourse = cache(async (courseCode: string): Promise<DegreeProgram[]> => {
  const code = normalizeCourseCode(courseCode);
  if (!code) return [];
  const pool = getDbPool();
  if (!pool) {
    if (!isFixturesEnabled()) return [];
    const all = await getPrograms();
    return all.filter((p) => p.nodes.some((n) => n.code.toLowerCase() === code.toLowerCase()));
  }

  try {
    const client = await pool.connect();
    try {
      const res = await client.query<{ slug: string }>(
        `
        SELECT DISTINCT p.slug
        FROM programs p
        JOIN program_requirement_groups prg ON prg.program_id = p.id
        JOIN program_requirement_courses prc ON prc.requirement_group_id = prg.id
        WHERE prc.course_code ILIKE $1;
      `,
        [code]
      );

      const fetched: DegreeProgram[] = [];
      for (const row of res.rows) {
        const p = await getProgramBySlug(row.slug);
        if (p) fetched.push(p);
      }
      return fetched;
    } finally {
      client.release();
    }
  } catch (err) {
    if (isFixturesEnabled()) return [];
    console.error("[getProgramsForCourse] database query failed", err);
    return [];
  }
});

export const getProgramSyncState = cache(async () => {
  const bundle = await loadProgramsSnapshotBundle();
  if (bundle?.syncState) {
    return {
      status: bundle.syncState.status,
      last_error: bundle.syncState.lastError,
      completed_at: asDate(bundle.syncState.completedAt),
      next_due_at: asDate(bundle.syncState.nextDueAt),
    };
  }

  const pool = getDbPool();
  if (!pool) return null;

  try {
    const client = await pool.connect();
    try {
      const res = await client.query<{
        status: string;
        last_error: string | null;
        completed_at: Date | null;
        next_due_at: Date | null;
      }>(
        "SELECT status, last_error, completed_at, next_due_at FROM program_sync_state WHERE id = 'program_sync' LIMIT 1"
      );
      if (res.rows.length > 0) return res.rows[0];
      return null;
    } finally {
      client.release();
    }
  } catch {
    return null;
  }
});

export interface SitemapProgram {
  slug: string;
  updatedAt: Date | null;
}

/**
 * Lean program list for sitemap generation. Does not load graphs or requirement trees.
 * Throws when a database pool exists but the query fails so we never cache an empty success.
 */
export const getSitemapPrograms = cache(async (): Promise<SitemapProgram[]> => {
  return safeCache(
    async () => {
      const bundle = await loadProgramsSnapshotBundle();
      if (bundle?.sitemap?.length) {
        return bundle.sitemap.map((row) => ({
          slug: row.slug,
          updatedAt: asDate(row.updatedAt),
        }));
      }

      const pool = getDbPool();
      if (!pool) {
        if (!isFixturesEnabled()) return [];
        return fixturePrograms.map((program) => ({ slug: program.slug, updatedAt: null }));
      }

      try {
        const client = await pool.connect();
        try {
          const res = await client.query<{ slug: string; updatedAt: Date | null }>(
            `
            SELECT slug, synced_at AS "updatedAt"
            FROM programs
            WHERE slug IS NOT NULL
            ORDER BY slug ASC;
          `,
          );
          return res.rows.map((row) => ({
            slug: row.slug,
            updatedAt: asDate(row.updatedAt),
          }));
        } finally {
          client.release();
        }
      } catch (err) {
        console.error("[getSitemapPrograms] database query failed", err);
        return [];
      }
    },
    ["sitemap-programs"],
    { tags: ["program-data"] },
  ).then((rows) =>
    rows.map((row) => ({
      slug: row.slug,
      updatedAt: asDate(row.updatedAt),
    })),
  );
});

export const getRelatedPrograms = cache(
  async (slug: string, limit = 6): Promise<RelatedProgramCandidate[]> => {
    const current = await getProgramBySlug(slug);
    if (!current) return [];

    const pool = getDbPool();
    if (!pool) {
      if (!isFixturesEnabled()) return [];
      const candidates = fixturePrograms.map((program) => ({
        slug: program.slug,
        title: program.title,
        credential: program.credential,
        degreeLevel: program.degreeLevel,
        sharedCourseCount: 0,
      }));
      return rankRelatedPrograms(current, candidates, limit);
    }

    return safeCache(
      async () => {
        const client = await pool.connect();
        try {
          const overlapRes = await client.query<{
            slug: string;
            title: string;
            credential: string;
            sharedCourseCount: string;
          }>(
            `
              WITH current_courses AS (
                SELECT DISTINCT upper(regexp_replace(prc.course_code, '\\s+', '', 'g')) AS code_key
                FROM programs p
                JOIN program_requirement_groups prg ON prg.program_id = p.id
                JOIN program_requirement_courses prc ON prc.requirement_group_id = prg.id
                WHERE p.slug = $1
                  AND prc.course_code IS NOT NULL
                  AND trim(prc.course_code) <> ''
              )
              SELECT
                p.slug,
                p.title,
                p.credential,
                COUNT(DISTINCT upper(regexp_replace(prc.course_code, '\\s+', '', 'g')))::text AS "sharedCourseCount"
              FROM programs p
              JOIN program_requirement_groups prg ON prg.program_id = p.id
              JOIN program_requirement_courses prc ON prc.requirement_group_id = prg.id
              JOIN current_courses cc
                ON cc.code_key = upper(regexp_replace(prc.course_code, '\\s+', '', 'g'))
              WHERE p.slug <> $1
              GROUP BY p.slug, p.title, p.credential
              ORDER BY COUNT(*) DESC, p.title ASC
              LIMIT 40;
            `,
            [slug],
          );

          const candidates: RelatedProgramCandidate[] = overlapRes.rows.map((row) => ({
            slug: row.slug,
            title: row.title,
            credential: row.credential,
            degreeLevel: normalizeDegreeLevel(row.credential),
            sharedCourseCount: parseInt(row.sharedCourseCount, 10) || 0,
          }));

          if (candidates.length < limit) {
            const fallback = await client.query<{
              slug: string;
              title: string;
              credential: string;
            }>(
              `
                SELECT slug, title, credential
                FROM programs
                WHERE slug <> $1
                ORDER BY title ASC
                LIMIT 80;
              `,
              [slug],
            );
            const seen = new Set(candidates.map((c) => c.slug));
            for (const row of fallback.rows) {
              if (seen.has(row.slug)) continue;
              candidates.push({
                slug: row.slug,
                title: row.title,
                credential: row.credential,
                degreeLevel: normalizeDegreeLevel(row.credential),
                sharedCourseCount: 0,
              });
            }
          }

          return rankRelatedPrograms(current, candidates, limit);
        } finally {
          client.release();
        }
      },
      ["related-programs", slug, String(limit)],
      { tags: ["program-data"] },
    );
  },
);

/** The latest successful catalog refresh, used for public data freshness messaging. */
export const getCatalogLastUpdated = cache(async (): Promise<Date | null> => {
  const cached = await safeCache(
    async () => {
      const bundle = await loadProgramsSnapshotBundle();
      if (bundle?.lastUpdated) {
        return asDate(bundle.lastUpdated);
      }

      const pool = getDbPool();
      if (!pool) return null;

      try {
        const client = await pool.connect();
        try {
          const res = await client.query<{ last_updated: Date | null }>(`
            SELECT COALESCE(
              (
                SELECT completed_at
                FROM program_sync_state
                WHERE completed_at IS NOT NULL
                ORDER BY completed_at DESC
                LIMIT 1
              ),
              (SELECT MAX(synced_at) FROM catalogs)
            ) AS last_updated;
          `);
          return asDate(res.rows[0]?.last_updated ?? null);
        } finally {
          client.release();
        }
      } catch {
        return null;
      }
    },
    ["catalog-last-updated"],
    { tags: ["program-data"] },
  );

  // `unstable_cache` serializes Dates as strings; always rehydrate for callers.
  return asDate(cached);
});

function filterFixtures(
  options?: { level?: string; year?: string },
  source = fixturePrograms
): DegreeProgram[] {
  return source.filter((p) => {
    if (options?.level && options.level !== "ALL" && p.degreeLevel !== options.level) {
      return false;
    }
    if (options?.year && options.year !== "ALL" && p.catalogYear !== options.year) {
      return false;
    }
    return true;
  });
}
