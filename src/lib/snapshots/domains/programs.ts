import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/pool";
import { CATEGORY_PALETTES } from "@/lib/graphLayout";
import { normalizeDegreeLevel } from "@/lib/kualiParser";
import { getCourseNodeId, normalizeCourseCode } from "@/lib/courseCode";
import { resolvePublicCatalogUrl } from "@/lib/snhuCatalog";
import type {
  CourseNodeData,
  DegreeProgram,
  GroupCategory,
  PrerequisiteEdgeData,
  RequirementGroup,
  RequirementItem,
  RequirementRuleMetadata,
} from "@/types/program";
import { createSnapshotVersion } from "../paths";
import { publishDomainSnapshot } from "../manifest";
import type { SnapshotMeta } from "../types";

/** Program directory row (mirrors serverData.ProgramSummary; kept local to avoid server-only). */
export interface ProgramSummary {
  slug: string;
  title: string;
  degreeLevel: DegreeProgram["degreeLevel"];
  credential: string;
  catalogYear: string;
  totalCredits: number | null;
  requiredCourseCount: number;
  description: string;
  sourceCatalogUrl: string | null;
}

export interface ProgramSitemapEntry {
  slug: string;
  updatedAt: string | null;
}

export interface ProgramSyncStateSnapshot {
  status: string;
  lastError: string | null;
  completedAt: string | null;
  nextDueAt: string | null;
}

export interface ProgramsSnapshotBundle {
  meta: SnapshotMeta;
  directory: ProgramSummary[];
  bySlug: Record<string, DegreeProgram>;
  catalogYears: string[];
  sitemap: ProgramSitemapEntry[];
  syncState: ProgramSyncStateSnapshot | null;
  lastUpdated: string | null;
}

type ProgramRow = {
  id: string;
  sourcePid: string | null;
  slug: string;
  title: string;
  credential: string;
  catalogYear: string;
  totalCredits: number | null;
  description: string;
  requiredCourseCount: string;
  syncedAt: Date | string | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function assertDbConfigured(): void {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is required to build program snapshots");
  }
}

async function loadProgramRows(client: PoolClient): Promise<ProgramRow[]> {
  const res = await client.query<ProgramRow>(
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
      p.synced_at as "syncedAt",
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
    `,
  );
  return res.rows;
}

async function hydrateProgram(
  client: PoolClient,
  row: ProgramRow,
): Promise<DegreeProgram> {
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
    SELECT id, parent_group_id, title, category, rule_type, minimum_selections,
           maximum_selections, minimum_credits, raw_excerpt, rule_metadata
    FROM program_requirement_groups
    WHERE program_id = $1
    ORDER BY sort_order ASC;
    `,
    [row.id],
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
      [gRow.id],
    );

    const textReqsRes = await client.query<{
      text: string;
      source_path: string;
      is_unparsed: boolean;
    }>(
      `
      SELECT text, source_path, is_unparsed FROM program_text_requirements
      WHERE requirement_group_id = $1
      ORDER BY sort_order ASC;
      `,
      [gRow.id],
    );

    const items: RequirementItem[] = [];

    for (const c of reqCoursesRes.rows) {
      let itemType: RequirementItem["type"] = "single";
      if (gRow.rule_type === "choose_n" || gRow.rule_type === "choose_credits") {
        itemType = "choice";
      } else if (gRow.rule_type === "free_elective" || gRow.rule_type === "elective") {
        itemType = "elective";
      }

      items.push({
        id: c.id,
        type: itemType,
        title: `${c.course_code}: ${c.title}`,
        credits: c.credits,
        description: c.is_optional ? "Optional Course" : undefined,
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

  for (const gData of groupDataMap.values()) {
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
  for (const gData of groupDataMap.values()) {
    if (gData.parent_group_id) continue;
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

  const targetNodesArr = Array.from(nodesMap.keys());
  let edgesRes: {
    rows: Array<{
      source_course_code: string;
      target_course_code: string;
      relationship_type: string;
      source_text: string | null;
      source_title: string | null;
      source_credits: number | null;
      source_resolution_status: CourseNodeData["resolutionStatus"] | null;
    }>;
  } = { rows: [] };

  if (targetNodesArr.length > 0) {
    edgesRes = await client.query(
      `
      SELECT e.source_course_code, e.target_course_code, e.relationship_type, e.source_text,
             c.title as source_title, c.credits as source_credits,
             c.resolution_status as source_resolution_status
      FROM degree_course_edges e
      LEFT JOIN degree_courses c ON e.source_course_code = c.course_code
      WHERE e.target_course_code = ANY($1::text[])
      `,
      [targetNodesArr],
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

    if (!targetNode) continue;

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
    if (eRow.relationship_type === "corequisite" && !targetNode.corequisites?.includes(srcId)) {
      targetNode.corequisites = [...(targetNode.corequisites || []), srcId];
    }

    edges.push({
      id: `e_${srcId}_${tgtId}_${eRow.relationship_type}`,
      source: srcId,
      target: tgtId,
      type: eRow.relationship_type === "corequisite" ? "corequisite" : "prerequisite",
      label: eRow.source_text || undefined,
    });
  }

  return {
    slug: row.slug,
    title: row.title,
    degreeLevel: normalizeDegreeLevel(row.credential),
    credential: row.credential,
    catalogYear: row.catalogYear || "2025-2026",
    totalCredits: row.totalCredits ?? null,
    requiredCourseCount: nodesMap.size,
    electiveCredits: null,
    estimatedDuration: "Not available",
    sourcePid: row.sourcePid?.trim() || undefined,
    sourceCatalogUrl: resolvePublicCatalogUrl(row.sourcePid),
    sourceName: "SNHU Academic Catalog",
    description: row.description || "",
    groups: topLevelGroups,
    nodes: Array.from(nodesMap.values()),
    edges,
    unparsedRequirements: unparsedNotes.length > 0 ? unparsedNotes : undefined,
  };
}

export async function buildProgramsSnapshotFromDatabase(): Promise<ProgramsSnapshotBundle> {
  assertDbConfigured();
  const pool = getPool();
  const client = await pool.connect();

  try {
    const rows = await loadProgramRows(client);
    if (rows.length === 0) {
      throw new Error("Refusing to build programs snapshot: directory is empty");
    }

    const directory: ProgramSummary[] = rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      degreeLevel: normalizeDegreeLevel(row.credential),
      credential: row.credential,
      catalogYear: row.catalogYear || "2025-2026",
      totalCredits: row.totalCredits ?? null,
      requiredCourseCount: parseInt(row.requiredCourseCount, 10) || 0,
      description: row.description || "",
      sourceCatalogUrl: resolvePublicCatalogUrl(row.sourcePid),
    }));

    const bySlug: Record<string, DegreeProgram> = {};
    for (const row of rows) {
      bySlug[row.slug] = await hydrateProgram(client, row);
    }

    const yearsRes = await client.query<{ year_label: string }>(
      "SELECT DISTINCT year_label FROM catalogs WHERE is_active = true ORDER BY year_label DESC;",
    );
    const catalogYears =
      yearsRes.rows.length > 0
        ? yearsRes.rows.map((r) => r.year_label)
        : [...new Set(directory.map((p) => p.catalogYear))];

    const sitemap: ProgramSitemapEntry[] = rows.map((row) => ({
      slug: row.slug,
      updatedAt: toIso(row.syncedAt),
    }));

    const syncRes = await client.query<{
      status: string;
      last_error: string | null;
      completed_at: Date | null;
      next_due_at: Date | null;
    }>(
      "SELECT status, last_error, completed_at, next_due_at FROM program_sync_state WHERE id = 'program_sync' LIMIT 1",
    );
    const syncRow = syncRes.rows[0] ?? null;
    const syncState: ProgramSyncStateSnapshot | null = syncRow
      ? {
          status: syncRow.status,
          lastError: syncRow.last_error,
          completedAt: toIso(syncRow.completed_at),
          nextDueAt: toIso(syncRow.next_due_at),
        }
      : null;

    const lastUpdatedRes = await client.query<{ last_updated: Date | null }>(`
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
    const lastUpdated = toIso(lastUpdatedRes.rows[0]?.last_updated ?? null);
    const version = createSnapshotVersion("programs");
    const publishedAt = new Date().toISOString();

    return {
      meta: {
        domain: "programs",
        version,
        publishedAt,
        sourceUpdatedAt: lastUpdated,
        counts: {
          directory: directory.length,
          bySlug: Object.keys(bySlug).length,
          catalogYears: catalogYears.length,
          sitemap: sitemap.length,
        },
      },
      directory,
      bySlug,
      catalogYears,
      sitemap,
      syncState,
      lastUpdated,
    };
  } finally {
    client.release();
  }
}

export function validateProgramsBundle(bundle: ProgramsSnapshotBundle): void {
  if (!bundle?.meta || bundle.meta.domain !== "programs") {
    throw new Error("Invalid programs snapshot: missing meta");
  }
  if (!Array.isArray(bundle.directory) || bundle.directory.length === 0) {
    throw new Error("Invalid programs snapshot: directory must be non-empty");
  }
  if (!bundle.bySlug || Object.keys(bundle.bySlug).length === 0) {
    throw new Error("Invalid programs snapshot: bySlug must be non-empty");
  }
}

export async function publishProgramsSnapshot(): Promise<{
  version: string;
  counts: { directory: number; bySlug: number };
}> {
  const bundle = await buildProgramsSnapshotFromDatabase();
  const { version } = await publishDomainSnapshot({
    domain: "programs",
    bundle,
    validate: validateProgramsBundle,
    sourceUpdatedAt: bundle.lastUpdated,
    counts: { programs: bundle.directory.length },
  });
  return {
    version,
    counts: {
      directory: bundle.directory.length,
      bySlug: Object.keys(bundle.bySlug).length,
    },
  };
}
