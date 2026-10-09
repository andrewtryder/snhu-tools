import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import type { ProgramsExport } from "./programs";
import type { SnapshotBundles, SnapshotManifest, SnapshotReport } from "./snapshot";

export interface CanonicalProgramRecord {
  slug: string;
  pid: string;
  title: string;
  credential?: string;
  degreeLevel?: string;
  catalogYear?: string;
  requiredCourseCount?: number;
  totalCredits?: number | null;
}

export interface DomainCountDiff {
  baseline: number;
  staged: number;
  delta: number;
}

export interface InventoryDiffSummary {
  hasChanges: boolean;
  programs: DomainCountDiff & { added: string[]; removed: string[]; modified: string[] };
  courses: DomainCountDiff & { added: string[]; removed: string[] };
  prerequisites: DomainCountDiff & { added: string[]; removed: string[] };
  transfers: DomainCountDiff & { added: string[]; removed: string[] };
  search: DomainCountDiff;
}

export interface SyncMarkerState {
  catalog: string | null;
  programs: string | null;
  transfers: string | null;
  catalogStatus?: string | null;
  programsStatus?: string | null;
  transfersStatus?: string | null;
  catalogNextDue?: string | null;
  programsNextDue?: string | null;
  transfersNextDue?: string | null;
}

export interface QuiescenceCheckResult {
  quiescent: boolean;
  markers: SyncMarkerState;
  reasons: string[];
}

export interface QuiescenceEvidence {
  markersBefore: SyncMarkerState;
  markersAfter?: SyncMarkerState | null;
  maxRecencyDays?: number;
  now?: Date | string;
}

export interface GateValidationOptions {
  canonicalInventory?: CanonicalProgramRecord[];
  allowProgramDeletions?: boolean;
  maxShrinkagePercent?: number;
  baselineManifest?: SnapshotManifest | null;
  baselineBundles?: SnapshotBundles | null;
  quiescenceEvidence?: QuiescenceEvidence | null;
  requireQuiescenceEvidence?: boolean;
}

export interface GateValidationResult {
  passed: boolean;
  gates: {
    manifestSchema: { passed: boolean; message: string };
    checksums: { passed: boolean; message: string };
    reconciliation: { passed: boolean; message: string };
    canonicalIdentifiers: { passed: boolean; message: string };
    canonicalProgramInventory: { passed: boolean; message: string };
    programStructures: { passed: boolean; message: string };
    cbePrograms: { passed: boolean; message: string };
    inventoryShrinkage: { passed: boolean; message: string };
    secretScanning: { passed: boolean; message: string };
    quiescenceAndTimestamps: { passed: boolean; message: string };
  };
  errors: string[];
  warnings: string[];
}

export const CANONICAL_CBE_PIDS = [
  "ryhJltQRI", // Business Operations Certificate (24 cr)
  "H1pYI4BZQ", // Management BA (120 cr)
  "ryX_U4rWQ", // Healthcare Management AA (60 cr)
  "rJUTINrWQ", // Communications BA (120 cr)
  "HJi-S-QHee", // Medical Office Administration Certificate (24 cr)
  "r1G9UNSbm", // General Studies AA (60 cr)
  "SJ2tLNH-7", // Healthcare Management BA (120 cr)
] as const;

export const EXPECTED_CBE_METRICS = {
  programs: 7,
  totalCredits: 528,
  totalGroups: 16,
  totalCompetencies: 312,
  totalMilestones: 7,
} as const;

export const DEFAULT_MAX_SHRINKAGE_PERCENT = 1.0; // 1% maximum allowable shrinkage without explicit review

const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function loadCanonicalInventory(filePath?: string): Promise<CanonicalProgramRecord[]> {
  const resolved = filePath ? path.resolve(filePath) : path.resolve("src/data/canonical-program-inventory.json");
  const content = await readFile(resolved, "utf8");
  const parsed = JSON.parse(content) as CanonicalProgramRecord[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Canonical program inventory at ${resolved} is invalid or empty`);
  }
  return parsed;
}

export function computeSyncMarkerDigest(markers: SyncMarkerState): string {
  return createHash("sha256").update(JSON.stringify(markers)).digest("hex");
}

export interface DomainCadenceRule {
  domain: "catalog" | "programs" | "transfers";
  name: string;
  table: string;
  cadenceDescription: string;
  nominalIntervalDays: number;
  gracePeriodDays: number;
  maxCompletedAgeDays: number;
  maxFutureIntervalDays: number;
}

export const DOMAIN_CADENCE_RULES: Record<"catalog" | "programs" | "transfers", DomainCadenceRule> = {
  catalog: {
    domain: "catalog",
    name: "Course catalog",
    table: "catalog_sync_state",
    cadenceDescription: "two-month cadence",
    nominalIntervalDays: 62, // 2-month cadence (~60-62 days)
    gracePeriodDays: 8, // conservative grace period for weekly CircleCI scheduled execution
    maxCompletedAgeDays: 70, // 62 + 8 days = 70 days max age
    maxFutureIntervalDays: 65, // at most 65 days in future from completion or now
  },
  programs: {
    domain: "programs",
    name: "Program catalog",
    table: "program_sync_state",
    cadenceDescription: "seven-day cadence",
    nominalIntervalDays: 7, // 7-day cadence
    gracePeriodDays: 8, // conservative grace period for weekly CircleCI scheduled execution
    maxCompletedAgeDays: 15, // 7 + 8 days = 15 days max age
    maxFutureIntervalDays: 8, // at most 8 days in future from completion or now
  },
  transfers: {
    domain: "transfers",
    name: "Transfer equivalency",
    table: "transfer_sync_state",
    cadenceDescription: "seven-day cadence",
    nominalIntervalDays: 7, // 7-day cadence
    gracePeriodDays: 8, // conservative grace period for weekly CircleCI scheduled execution
    maxCompletedAgeDays: 15, // 7 + 8 days = 15 days max age
    maxFutureIntervalDays: 8, // at most 8 days in future from completion or now
  },
};

export function validateDomainSyncFreshness(
  domain: "catalog" | "programs" | "transfers",
  completedAt: string | null | undefined,
  status: string | null | undefined,
  nextDueAt: string | null | undefined,
  nowMs: number,
  options?: { isPreExportCheck?: boolean; maxRecencyDays?: number }
): string[] {
  const rule = DOMAIN_CADENCE_RULES[domain];
  const issues: string[] = [];
  const isPreExport = options?.isPreExportCheck ?? false;

  // 1. Completion marker presence
  if (!completedAt) {
    issues.push(`${rule.table} has no completed_at timestamp`);
  }

  // 2. Status validation against domain sync schemas
  if (!status) {
    issues.push(`${rule.table} status is missing`);
  } else if (status !== "idle") {
    if (isPreExport) {
      if (status === "running") {
        issues.push(`${rule.table} is currently running`);
      } else if (status === "in_progress") {
        issues.push(`${rule.table} is currently in progress`);
      } else if (status === "error") {
        issues.push(`${rule.table} is in error state`);
      } else if (status === "awaiting_bootstrap") {
        issues.push(`${rule.table} is awaiting bootstrap`);
      } else {
        issues.push(`${rule.table} status is not idle (${status})`);
      }
    } else {
      issues.push(`${rule.table} status is '${status}' (must be 'idle')`);
    }
  }

  // 3. CompletedAt timestamp recency and future checks
  let completedMs: number | null = null;
  if (completedAt) {
    completedMs = new Date(completedAt).getTime();
    if (Number.isNaN(completedMs)) {
      issues.push(`${rule.domain} completed_at timestamp '${completedAt}' is invalid`);
    } else if (completedMs - nowMs > 5 * 60 * 1000) {
      issues.push(
        isPreExport
          ? `${rule.table} completed_at (${completedAt}) is in the future`
          : `${rule.domain} completed_at timestamp (${completedAt}) is in the future`
      );
    } else if (nowMs - completedMs > rule.maxCompletedAgeDays * 24 * 60 * 60 * 1000) {
      issues.push(
        isPreExport
          ? `${rule.table} completed_at (${completedAt}) is stale (older than ${rule.maxCompletedAgeDays} days)`
          : `${rule.domain} completed_at timestamp (${completedAt}) is stale (older than ${rule.maxCompletedAgeDays} days)`
      );
    }
  }

  // 4. NextDueAt schedule validation
  if (!nextDueAt) {
    issues.push(`${rule.table} has no next_due_at timestamp`);
  } else {
    const nextDueMs = new Date(nextDueAt).getTime();
    if (Number.isNaN(nextDueMs)) {
      issues.push(`${rule.table} next_due_at timestamp '${nextDueAt}' is invalid`);
    } else {
      if (completedMs !== null && !Number.isNaN(completedMs) && nextDueMs < completedMs - 5 * 60 * 1000) {
        issues.push(`${rule.table} next_due_at (${nextDueAt}) is before completed_at (${completedAt})`);
      } else if (
        completedMs !== null &&
        !Number.isNaN(completedMs) &&
        nextDueMs - completedMs > rule.maxFutureIntervalDays * 24 * 60 * 60 * 1000
      ) {
        issues.push(
          `${rule.table} next_due_at (${nextDueAt}) is implausibly distant (exceeds ${rule.maxFutureIntervalDays} days from completion)`
        );
      } else if (nextDueMs - nowMs > rule.maxFutureIntervalDays * 24 * 60 * 60 * 1000) {
        issues.push(`${rule.table} next_due_at (${nextDueAt}) is implausibly distant in the future (${nextDueAt})`);
      }

      const graceDays =
        options?.maxRecencyDays !== undefined && domain !== "catalog"
          ? options.maxRecencyDays
          : rule.gracePeriodDays;

      if (nowMs > nextDueMs + graceDays * 24 * 60 * 60 * 1000) {
        issues.push(
          `${rule.table} is overdue for refresh (due: ${nextDueAt}, grace period of ${graceDays} days exceeded)`
        );
      }
    }
  }

  return issues;
}

export async function checkQuiescence(
  pool: Pool,
  options?: { maxRecencyDays?: number; now?: Date | string }
): Promise<QuiescenceCheckResult> {
  const client = await pool.connect();
  const reasons: string[] = [];
  try {
    const res = await client.query<{
      catalog: string | null;
      programs: string | null;
      transfers: string | null;
      catalog_status: string | null;
      programs_status: string | null;
      transfers_status: string | null;
      catalog_next_due: string | null;
      programs_next_due: string | null;
      transfers_next_due: string | null;
    }>(`
      SELECT
        (SELECT completed_at::text FROM catalog_sync_state WHERE id='catalog') AS catalog,
        (SELECT completed_at::text FROM program_sync_state WHERE id='program_sync') AS programs,
        (SELECT completed_at::text FROM transfer_sync_state WHERE id='transfer') AS transfers,
        (SELECT status FROM catalog_sync_state WHERE id='catalog') AS catalog_status,
        (SELECT status FROM program_sync_state WHERE id='program_sync') AS programs_status,
        (SELECT status FROM transfer_sync_state WHERE id='transfer') AS transfers_status,
        (SELECT next_due_at::text FROM catalog_sync_state WHERE id='catalog') AS catalog_next_due,
        (SELECT next_due_at::text FROM program_sync_state WHERE id='program_sync') AS programs_next_due,
        (SELECT next_due_at::text FROM transfer_sync_state WHERE id='transfer') AS transfers_next_due
    `);

    const row = res.rows[0] ?? {
      catalog: null,
      programs: null,
      transfers: null,
      catalog_status: null,
      programs_status: null,
      transfers_status: null,
      catalog_next_due: null,
      programs_next_due: null,
      transfers_next_due: null,
    };

    const markers: SyncMarkerState = {
      catalog: row.catalog,
      programs: row.programs,
      transfers: row.transfers,
      catalogStatus: row.catalog_status,
      programsStatus: row.programs_status,
      transfersStatus: row.transfers_status,
      catalogNextDue: row.catalog_next_due,
      programsNextDue: row.programs_next_due,
      transfersNextDue: row.transfers_next_due,
    };

    const nowMs = options?.now ? new Date(options.now).getTime() : Date.now();

    const domainSpecs = [
      {
        domain: "catalog" as const,
        completedAt: markers.catalog,
        status: markers.catalogStatus,
        nextDueAt: markers.catalogNextDue,
      },
      {
        domain: "programs" as const,
        completedAt: markers.programs,
        status: markers.programsStatus,
        nextDueAt: markers.programsNextDue,
      },
      {
        domain: "transfers" as const,
        completedAt: markers.transfers,
        status: markers.transfersStatus,
        nextDueAt: markers.transfersNextDue,
      },
    ];

    for (const spec of domainSpecs) {
      const domainReasons = validateDomainSyncFreshness(
        spec.domain,
        spec.completedAt,
        spec.status,
        spec.nextDueAt,
        nowMs,
        { isPreExportCheck: true, maxRecencyDays: options?.maxRecencyDays }
      );
      reasons.push(...domainReasons);
    }

    return {
      quiescent: reasons.length === 0,
      markers,
      reasons,
    };
  } finally {
    client.release();
  }
}

export function validateQuiescenceAndTimestamps(
  evidence?: QuiescenceEvidence | null,
  manifest?: SnapshotManifest | null
): string[] {
  if (!evidence) {
    return ["Quiescence and sync status is unverifiable: no database sync evidence provided"];
  }

  const errors: string[] = [];
  const { markersBefore, markersAfter, maxRecencyDays, now } = evidence;
  const nowMs = now ? new Date(now).getTime() : Date.now();

  const domainSpecs = [
    {
      domain: "catalog" as const,
      completedAt: markersBefore.catalog,
      status: markersBefore.catalogStatus,
      nextDueAt: markersBefore.catalogNextDue,
    },
    {
      domain: "programs" as const,
      completedAt: markersBefore.programs,
      status: markersBefore.programsStatus,
      nextDueAt: markersBefore.programsNextDue,
    },
    {
      domain: "transfers" as const,
      completedAt: markersBefore.transfers,
      status: markersBefore.transfersStatus,
      nextDueAt: markersBefore.transfersNextDue,
    },
  ];

  for (const spec of domainSpecs) {
    const domainErrors = validateDomainSyncFreshness(
      spec.domain,
      spec.completedAt,
      spec.status,
      spec.nextDueAt,
      nowMs,
      { isPreExportCheck: false, maxRecencyDays }
    );
    errors.push(...domainErrors);
  }

  // 4. Marker shifting check
  if (markersAfter) {
    if (JSON.stringify(markersBefore) !== JSON.stringify(markersAfter)) {
      errors.push("Sync markers shifted between pre-export and post-export checks");
    }
  }

  // 5. Manifest sourceDigest reconciliation
  if (manifest?.provenance?.sourceDigest) {
    const expectedDigest = computeSyncMarkerDigest(markersBefore);
    if (manifest.provenance.sourceDigest !== expectedDigest) {
      errors.push(
        `Manifest sourceDigest (${manifest.provenance.sourceDigest}) does not match sync markers digest (${expectedDigest})`
      );
    }
  }

  return errors;
}

export function validateManifestAndProvenance(manifest: SnapshotManifest): string[] {
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1) errors.push(`Unexpected manifest schemaVersion: ${manifest.schemaVersion}`);
  if (manifest.fixture) errors.push("Manifest is marked as fixture; automation requires production manifest");
  if (!manifest.provenance) {
    errors.push("Manifest has no provenance metadata");
  } else {
    if (manifest.provenance.kind !== "postgres") {
      errors.push(`Provenance kind must be 'postgres', got '${manifest.provenance.kind}'`);
    }
    if (!manifest.provenance.approved) {
      errors.push("Snapshot provenance is not marked as approved");
    }
    if (!manifest.provenance.approvalReference?.trim()) {
      errors.push("Snapshot provenance requires non-empty approvalReference");
    }
    if (!/^[a-f0-9]{64}$/i.test(manifest.provenance.sourceDigest)) {
      errors.push("Snapshot provenance sourceDigest is not a valid SHA-256 hex digest");
    }
  }

  const requiredDomains: Array<"programs" | "courses" | "transfers" | "search"> = [
    "programs",
    "courses",
    "transfers",
    "search",
  ];
  for (const domain of requiredDomains) {
    const entry = manifest.domains[domain];
    if (!entry) {
      errors.push(`Manifest is missing domain entry for ${domain}`);
    } else {
      if (!entry.required) errors.push(`Manifest domain ${domain} must be marked required`);
      if (entry.file !== `${domain}.json`) errors.push(`Manifest domain ${domain} file must be ${domain}.json`);
      if (!/^[a-f0-9]{64}$/i.test(entry.sha256)) errors.push(`Manifest domain ${domain} sha256 is invalid`);
    }
  }

  return errors;
}

export function validateDomainChecksums(bundles: SnapshotBundles, manifest: SnapshotManifest): string[] {
  const errors: string[] = [];
  const domains: Array<"programs" | "courses" | "transfers" | "search"> = [
    "programs",
    "courses",
    "transfers",
    "search",
  ];

  for (const domain of domains) {
    const calculated = digest(bundles[domain]);
    const recorded = manifest.domains[domain]?.sha256;
    if (calculated !== recorded) {
      errors.push(`SHA-256 checksum mismatch for ${domain}: recorded ${recorded}, calculated ${calculated}`);
    }
  }

  return errors;
}

export function validateReconciliation(bundles: SnapshotBundles): string[] {
  const errors: string[] = [];
  const { courses, search, programs, transfers } = bundles;

  const reconciliation = courses.reconciliation;
  if (!reconciliation) {
    errors.push("Courses bundle is missing reconciliation block");
  } else {
    const { records, prerequisiteEdges, sourceCoverage } = reconciliation;
    if (records.rejectedRows !== 0) {
      errors.push(`Course records reconciliation has ${records.rejectedRows} rejected rows (must be 0)`);
    }
    if (records.duplicateRows !== 0) {
      errors.push(`Course records reconciliation has ${records.duplicateRows} duplicate rows (must be 0)`);
    }
    if (records.sourceRows !== records.exportedRecords) {
      errors.push(`Course records source rows (${records.sourceRows}) !== exported records (${records.exportedRecords})`);
    }
    if (records.exportedRecords !== courses.ids.length) {
      errors.push(`Course exported records (${records.exportedRecords}) !== course ID inventory (${courses.ids.length})`);
    }

    if (prerequisiteEdges.rejectedRows !== 0) {
      errors.push(`Prerequisite edges reconciliation has ${prerequisiteEdges.rejectedRows} rejected rows (must be 0)`);
    }
    if (prerequisiteEdges.duplicateRows !== 0) {
      errors.push(`Prerequisite edges reconciliation has ${prerequisiteEdges.duplicateRows} duplicate rows (must be 0)`);
    }
    if (prerequisiteEdges.sourceRows !== prerequisiteEdges.exportedEdges) {
      errors.push(`Prerequisite edges source rows (${prerequisiteEdges.sourceRows}) !== exported edges (${prerequisiteEdges.exportedEdges})`);
    }
    if (prerequisiteEdges.exportedEdges !== courses.edges.length) {
      errors.push(`Prerequisite edges exported (${prerequisiteEdges.exportedEdges}) !== courses edges count (${courses.edges.length})`);
    }

    if (!sourceCoverage) {
      errors.push("Courses bundle is missing source coverage reconciliation");
    } else {
      if (sourceCoverage.coursesData.excluded.missingCatalogCourseId !== 0) {
        errors.push(`coursesData has ${sourceCoverage.coursesData.excluded.missingCatalogCourseId} rows with missing catalog course ID`);
      }
      if (sourceCoverage.prerequisites.excluded.orphanClassId !== 0) {
        errors.push(`prerequisites has ${sourceCoverage.prerequisites.excluded.orphanClassId} orphan class ID rows`);
      }
      if (sourceCoverage.prerequisites.excluded.parentMissingCatalogCourseId !== 0) {
        errors.push(`prerequisites has ${sourceCoverage.prerequisites.excluded.parentMissingCatalogCourseId} parent missing catalog course ID rows`);
      }
      if (sourceCoverage.prerequisites.excluded.missingPrerequisiteCourseId !== 0) {
        errors.push(`prerequisites has ${sourceCoverage.prerequisites.excluded.missingPrerequisiteCourseId} missing prerequisite course ID rows`);
      }
      if (sourceCoverage.prerequisites.excluded.selfReference !== 0) {
        errors.push(`prerequisites has ${sourceCoverage.prerequisites.excluded.selfReference} self-reference rows`);
      }
    }
  }

  // Cross-domain search reconciliation
  const expectedSearchEntries = programs.directory.length + courses.summaries.length + transfers.rows.length;
  if (search.meta.counts.entries !== expectedSearchEntries) {
    errors.push(`Search entry count (${search.meta.counts.entries}) does not equal sum of domains (${expectedSearchEntries})`);
  }
  if (search.programs.length !== programs.directory.length) {
    errors.push(`Search programs count (${search.programs.length}) does not match programs directory (${programs.directory.length})`);
  }
  if (search.courses.length !== courses.summaries.length) {
    errors.push(`Search courses count (${search.courses.length}) does not match course summaries (${courses.summaries.length})`);
  }
  if (search.transfers.length !== transfers.rows.length) {
    errors.push(`Search transfers count (${search.transfers.length}) does not match transfer rows (${transfers.rows.length})`);
  }

  return errors;
}

export function validateCanonicalIdentifiers(bundles: SnapshotBundles): string[] {
  const errors: string[] = [];
  const { programs, courses, transfers } = bundles;

  // Program slugs
  const slugs = programs.directory.map((p) => p.slug);
  const uniqueSlugs = new Set(slugs);
  if (uniqueSlugs.size !== slugs.length) {
    errors.push(`Duplicate program slugs detected (${slugs.length - uniqueSlugs.size} duplicates)`);
  }

  // Program source PIDs
  const pids = programs.directory
    .map((p) => programs.bySlug[p.slug]?.sourcePid)
    .filter((pid): pid is string => Boolean(pid));
  const uniquePids = new Set(pids);
  if (uniquePids.size !== pids.length) {
    errors.push(`Duplicate program source PIDs detected (${pids.length - uniquePids.size} duplicates)`);
  }

  // Course IDs
  const courseIds = courses.ids;
  const uniqueCourseIds = new Set(courseIds);
  if (uniqueCourseIds.size !== courseIds.length) {
    errors.push(`Duplicate course IDs detected (${courseIds.length - uniqueCourseIds.size} duplicates)`);
  }

  // Course summaries
  const summaryIds = courses.summaries.map((s) => s.catalog_course_id);
  const uniqueSummaryIds = new Set(summaryIds);
  if (uniqueSummaryIds.size !== summaryIds.length) {
    errors.push(`Duplicate course summary IDs detected (${summaryIds.length - uniqueSummaryIds.size} duplicates)`);
  }

  // Transfer course numbers
  for (let i = 0; i < transfers.rows.length; i++) {
    const row = transfers.rows[i];
    if (!row.courseNumber || typeof row.courseNumber !== "string" || !row.courseNumber.trim()) {
      errors.push(`Transfer row ${i} has empty courseNumber`);
      break;
    }
  }

  return errors;
}

export function validateCanonicalProgramInventory(
  programs: ProgramsExport,
  canonicalInventory: CanonicalProgramRecord[],
  allowDeletions = false
): string[] {
  const errors: string[] = [];
  const bySlug = programs.bySlug;

  const currentSlugs = new Set(programs.directory.map((p) => p.slug));
  const missingCanonicalSlugs: string[] = [];
  const pidMismatches: string[] = [];

  for (const expected of canonicalInventory) {
    if (!currentSlugs.has(expected.slug)) {
      missingCanonicalSlugs.push(expected.slug);
      continue;
    }

    const current = bySlug[expected.slug];
    if (!current) {
      missingCanonicalSlugs.push(expected.slug);
      continue;
    }

    if (current.sourcePid !== expected.pid) {
      pidMismatches.push(
        `Program ${expected.slug} PID mismatch: expected '${expected.pid}', found '${current.sourcePid}'`
      );
    }
  }

  if (missingCanonicalSlugs.length > 0) {
    if (!allowDeletions) {
      errors.push(
        `Missing ${missingCanonicalSlugs.length} canonical program slugs without explicit deletion approval: ${missingCanonicalSlugs.slice(0, 5).join(", ")}${missingCanonicalSlugs.length > 5 ? "..." : ""}`
      );
    }
  }

  if (pidMismatches.length > 0) {
    errors.push(...pidMismatches);
  }

  if (!allowDeletions && programs.directory.length < canonicalInventory.length) {
    errors.push(
      `Program count dropped below canonical baseline: ${programs.directory.length} < ${canonicalInventory.length}`
    );
  }

  return errors;
}

export function validateProgramStructures(programs: ProgramsExport): string[] {
  const errors: string[] = [];

  for (const dir of programs.directory) {
    const detail = programs.bySlug[dir.slug];
    if (!detail) {
      errors.push(`Program ${dir.slug} in directory has no detail record in bySlug`);
      continue;
    }

    if (!dir.title?.trim()) errors.push(`Program ${dir.slug} has empty title`);
    if (!dir.credential?.trim()) errors.push(`Program ${dir.slug} has empty credential`);
    if (!dir.catalogYear?.trim()) errors.push(`Program ${dir.slug} has empty catalogYear`);

    if (!Array.isArray(detail.groups) || detail.groups.length === 0) {
      errors.push(`Program ${dir.slug} has 0 requirement groups (empty program)`);
    }

    if (!Array.isArray(detail.nodes)) {
      errors.push(`Program ${dir.slug} has invalid nodes array`);
    }

    if (!Array.isArray(detail.edges)) {
      errors.push(`Program ${dir.slug} has invalid edges array`);
    }

    if (typeof dir.requiredCourseCount !== "number" || dir.requiredCourseCount < 0) {
      errors.push(`Program ${dir.slug} has invalid requiredCourseCount: ${dir.requiredCourseCount}`);
    }
  }

  return errors;
}

export function validateCbePrograms(programs: ProgramsExport): string[] {
  const errors: string[] = [];
  const cbePids = new Set<string>(CANONICAL_CBE_PIDS);

  const foundCbePrograms = Object.values(programs.bySlug).filter((p) =>
    p.sourcePid ? cbePids.has(p.sourcePid) : false
  );

  if (foundCbePrograms.length !== EXPECTED_CBE_METRICS.programs) {
    errors.push(
      `Expected ${EXPECTED_CBE_METRICS.programs} Direct Assessment CBE programs, found ${foundCbePrograms.length}`
    );
  }

  const foundPids = new Set(foundCbePrograms.map((p) => p.sourcePid));
  for (const expectedPid of CANONICAL_CBE_PIDS) {
    if (!foundPids.has(expectedPid)) {
      errors.push(`Missing expected CBE program with PID: ${expectedPid}`);
    }
  }

  let totalCredits = 0;
  let totalGroups = 0;
  let totalCompetencies = 0;
  let totalMilestones = 0;

  for (const cbe of foundCbePrograms) {
    totalCredits += cbe.totalCredits ?? 0;
    totalGroups += cbe.groups?.length ?? 0;

    for (const g of cbe.groups ?? []) {
      for (const item of g.items ?? []) {
        if (item.textKind || item.sourceText || item.credits === null) {
          totalMilestones++;
        } else {
          totalCompetencies++;
        }
      }
    }
  }

  if (totalCredits !== EXPECTED_CBE_METRICS.totalCredits) {
    errors.push(
      `CBE total credits mismatch: expected ${EXPECTED_CBE_METRICS.totalCredits}, found ${totalCredits}`
    );
  }

  if (totalGroups !== EXPECTED_CBE_METRICS.totalGroups) {
    errors.push(
      `CBE total requirement groups mismatch: expected ${EXPECTED_CBE_METRICS.totalGroups}, found ${totalGroups}`
    );
  }

  if (totalCompetencies !== EXPECTED_CBE_METRICS.totalCompetencies) {
    errors.push(
      `CBE total competencies mismatch: expected ${EXPECTED_CBE_METRICS.totalCompetencies}, found ${totalCompetencies}`
    );
  }

  if (totalMilestones !== EXPECTED_CBE_METRICS.totalMilestones) {
    errors.push(
      `CBE total text milestones mismatch: expected ${EXPECTED_CBE_METRICS.totalMilestones}, found ${totalMilestones}`
    );
  }

  return errors;
}

export function validateInventoryShrinkage(
  stagedBundles: SnapshotBundles,
  baselineBundles: SnapshotBundles | null,
  options?: { maxShrinkagePercent?: number; allowShrinkage?: boolean }
): string[] {
  if (!baselineBundles) return [];
  const errors: string[] = [];
  const maxPercent = options?.maxShrinkagePercent ?? DEFAULT_MAX_SHRINKAGE_PERCENT;
  const allow = options?.allowShrinkage ?? false;

  const checkDomain = (name: string, current: number, baseline: number) => {
    if (baseline <= 0) return;
    const drop = baseline - current;
    if (drop > 0) {
      const dropPercent = (drop / baseline) * 100;
      if (dropPercent > maxPercent && !allow) {
        errors.push(
          `${name} inventory shrank by ${dropPercent.toFixed(2)}% (${drop} items lost: ${baseline} -> ${current}), exceeding strict ${maxPercent}% threshold`
        );
      }
    }
  };

  checkDomain("Programs", stagedBundles.programs.directory.length, baselineBundles.programs.directory.length);
  checkDomain("Courses", stagedBundles.courses.ids.length, baselineBundles.courses.ids.length);
  checkDomain("Prerequisite Edges", stagedBundles.courses.edges.length, baselineBundles.courses.edges.length);
  checkDomain("Transfers", stagedBundles.transfers.rows.length, baselineBundles.transfers.rows.length);

  return errors;
}

export function scanForSecrets(value: unknown, location = "root"): string[] {
  const leaks: string[] = [];
  if (!value) return leaks;

  if (typeof value === "string") {
    if (/postgres(?:ql)?:\/\/[^\s"'<>]+/i.test(value)) {
      leaks.push(`${location}: Contains PostgreSQL connection string`);
    }
    if (/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i.test(value) || /ghp_[a-zA-Z0-9]{36}/.test(value) || /github_pat_[a-zA-Z0-9_]{60,}/.test(value)) {
      leaks.push(`${location}: Contains potential API token / authorization credential`);
    }
    if (/ep-[a-z0-9\-]+(?:-[a-z0-9]+)?\.aws\.neon\.tech/i.test(value)) {
      leaks.push(`${location}: Contains private Neon database endpoint hostname`);
    }
    if (/-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i.test(value)) {
      leaks.push(`${location}: Contains private key`);
    }
    return leaks;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      leaks.push(...scanForSecrets(value[i], `${location}[${i}]`));
    }
    return leaks;
  }

  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/password|secret|private_key|auth_token/i.test(k) && !/description|title|text/i.test(k)) {
        leaks.push(`${location}.${k}: Key name implies credential or secret`);
      }
      leaks.push(...scanForSecrets(v, `${location}.${k}`));
    }
  }

  return leaks;
}

export function validateAllGates(
  stagedBundles: SnapshotBundles,
  manifest: SnapshotManifest,
  report: SnapshotReport,
  options: GateValidationOptions = {}
): GateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const manifestErrors = validateManifestAndProvenance(manifest);
  const checksumErrors = validateDomainChecksums(stagedBundles, manifest);
  const reconciliationErrors = validateReconciliation(stagedBundles);
  const identifierErrors = validateCanonicalIdentifiers(stagedBundles);

  const inventory = options.canonicalInventory ?? [];
  const inventoryErrors = inventory.length > 0
    ? validateCanonicalProgramInventory(stagedBundles.programs, inventory, options.allowProgramDeletions)
    : [];

  const structureErrors = validateProgramStructures(stagedBundles.programs);
  const cbeErrors = validateCbePrograms(stagedBundles.programs);
  const shrinkageErrors = validateInventoryShrinkage(stagedBundles, options.baselineBundles ?? null, {
    maxShrinkagePercent: options.maxShrinkagePercent,
  });

  const secretErrors = [
    ...scanForSecrets(manifest, "manifest"),
    ...scanForSecrets(report, "report"),
    ...scanForSecrets(stagedBundles.programs, "programs"),
    ...scanForSecrets(stagedBundles.courses, "courses"),
    ...scanForSecrets(stagedBundles.transfers, "transfers"),
    ...scanForSecrets(stagedBundles.search, "search"),
  ];

  const quiescenceErrors =
    options.requireQuiescenceEvidence === false && !options.quiescenceEvidence
      ? []
      : validateQuiescenceAndTimestamps(options.quiescenceEvidence, manifest);

  errors.push(
    ...manifestErrors,
    ...checksumErrors,
    ...reconciliationErrors,
    ...identifierErrors,
    ...inventoryErrors,
    ...structureErrors,
    ...cbeErrors,
    ...shrinkageErrors,
    ...secretErrors,
    ...quiescenceErrors
  );

  const buildGateStatus = (gateErrors: string[]) => ({
    passed: gateErrors.length === 0,
    message: gateErrors.length === 0 ? "PASSED" : gateErrors.join("; "),
  });

  const gates = {
    manifestSchema: buildGateStatus(manifestErrors),
    checksums: buildGateStatus(checksumErrors),
    reconciliation: buildGateStatus(reconciliationErrors),
    canonicalIdentifiers: buildGateStatus(identifierErrors),
    canonicalProgramInventory: buildGateStatus(inventoryErrors),
    programStructures: buildGateStatus(structureErrors),
    cbePrograms: buildGateStatus(cbeErrors),
    inventoryShrinkage: buildGateStatus(shrinkageErrors),
    secretScanning: buildGateStatus(secretErrors),
    quiescenceAndTimestamps:
      options.requireQuiescenceEvidence === false && !options.quiescenceEvidence
        ? { passed: true, message: "SKIPPED: Waived for offline fixture test without database" }
        : buildGateStatus(quiescenceErrors),
  };

  return {
    passed: errors.length === 0,
    gates,
    errors,
    warnings,
  };
}

export function computeInventoryDiff(
  staged: SnapshotBundles,
  baseline: SnapshotBundles | null
): InventoryDiffSummary {
  if (!baseline) {
    return {
      hasChanges: true,
      programs: {
        baseline: 0,
        staged: staged.programs.directory.length,
        delta: staged.programs.directory.length,
        added: staged.programs.directory.map((p) => p.slug),
        removed: [],
        modified: [],
      },
      courses: {
        baseline: 0,
        staged: staged.courses.ids.length,
        delta: staged.courses.ids.length,
        added: staged.courses.ids,
        removed: [],
      },
      prerequisites: {
        baseline: 0,
        staged: staged.courses.edges.length,
        delta: staged.courses.edges.length,
        added: staged.courses.edges.map((e) => `${e.parentId}->${e.childId}`),
        removed: [],
      },
      transfers: {
        baseline: 0,
        staged: staged.transfers.rows.length,
        delta: staged.transfers.rows.length,
        added: staged.transfers.rows.map((r) => r.courseNumber).filter((c): c is string => Boolean(c)),
        removed: [],
      },
      search: {
        baseline: 0,
        staged: staged.search.meta.counts.entries,
        delta: staged.search.meta.counts.entries,
      },
    };
  }

  // Compare programs
  const baseProgSlugs = new Set(baseline.programs.directory.map((p) => p.slug));
  const stagedProgSlugs = new Set(staged.programs.directory.map((p) => p.slug));
  const addedPrograms = staged.programs.directory.map((p) => p.slug).filter((s) => !baseProgSlugs.has(s));
  const removedPrograms = baseline.programs.directory.map((p) => p.slug).filter((s) => !stagedProgSlugs.has(s));
  const modifiedPrograms: string[] = [];

  for (const slug of stagedProgSlugs) {
    if (baseProgSlugs.has(slug)) {
      if (digest(staged.programs.bySlug[slug]) !== digest(baseline.programs.bySlug[slug])) {
        modifiedPrograms.push(slug);
      }
    }
  }

  // Compare courses
  const baseCourseIds = new Set(baseline.courses.ids);
  const stagedCourseIds = new Set(staged.courses.ids);
  const addedCourses = staged.courses.ids.filter((id) => !baseCourseIds.has(id));
  const removedCourses = baseline.courses.ids.filter((id) => !stagedCourseIds.has(id));

  // Compare edges
  const baseEdges = new Set(baseline.courses.edges.map((e) => `${e.parentId}->${e.childId}`));
  const stagedEdges = new Set(staged.courses.edges.map((e) => `${e.parentId}->${e.childId}`));
  const addedEdges = [...stagedEdges].filter((k) => !baseEdges.has(k));
  const removedEdges = [...baseEdges].filter((k) => !stagedEdges.has(k));

  // Compare transfers
  const baseTransferKeys = new Set(baseline.transfers.rows.map((r) => `${r.courseNumber}:${r.title ?? ""}`));
  const stagedTransferKeys = new Set(staged.transfers.rows.map((r) => `${r.courseNumber}:${r.title ?? ""}`));
  const addedTransfers = staged.transfers.rows
    .filter((r) => r.courseNumber && !baseTransferKeys.has(`${r.courseNumber}:${r.title ?? ""}`))
    .map((r) => r.courseNumber as string);
  const removedTransfers = baseline.transfers.rows
    .filter((r) => r.courseNumber && !stagedTransferKeys.has(`${r.courseNumber}:${r.title ?? ""}`))
    .map((r) => r.courseNumber as string);

  const hasChanges =
    addedPrograms.length > 0 ||
    removedPrograms.length > 0 ||
    modifiedPrograms.length > 0 ||
    addedCourses.length > 0 ||
    removedCourses.length > 0 ||
    addedEdges.length > 0 ||
    removedEdges.length > 0 ||
    addedTransfers.length > 0 ||
    removedTransfers.length > 0;

  return {
    hasChanges,
    programs: {
      baseline: baseline.programs.directory.length,
      staged: staged.programs.directory.length,
      delta: staged.programs.directory.length - baseline.programs.directory.length,
      added: addedPrograms,
      removed: removedPrograms,
      modified: modifiedPrograms,
    },
    courses: {
      baseline: baseline.courses.ids.length,
      staged: staged.courses.ids.length,
      delta: staged.courses.ids.length - baseline.courses.ids.length,
      added: addedCourses,
      removed: removedCourses,
    },
    prerequisites: {
      baseline: baseline.courses.edges.length,
      staged: staged.courses.edges.length,
      delta: staged.courses.edges.length - baseline.courses.edges.length,
      added: addedEdges,
      removed: removedEdges,
    },
    transfers: {
      baseline: baseline.transfers.rows.length,
      staged: staged.transfers.rows.length,
      delta: staged.transfers.rows.length - baseline.transfers.rows.length,
      added: addedTransfers,
      removed: removedTransfers,
    },
    search: {
      baseline: baseline.search.meta.counts.entries,
      staged: staged.search.meta.counts.entries,
      delta: staged.search.meta.counts.entries - baseline.search.meta.counts.entries,
    },
  };
}

export function hasDomainDifferences(
  stagedManifest: SnapshotManifest,
  baselineManifest: SnapshotManifest | null
): boolean {
  if (!baselineManifest) return true;
  const domains: Array<"programs" | "courses" | "transfers" | "search"> = [
    "programs",
    "courses",
    "transfers",
    "search",
  ];

  for (const domain of domains) {
    if (stagedManifest.domains[domain]?.sha256 !== baselineManifest.domains[domain]?.sha256) {
      return true;
    }
  }

  return false;
}

export function generatePrSummary(options: {
  stagedManifest: SnapshotManifest;
  baselineManifest: SnapshotManifest | null;
  diff: InventoryDiffSummary;
  gateResults: GateValidationResult;
  syncMarkers?: SyncMarkerState | null;
  dateStr?: string;
}): string {
  const { stagedManifest, baselineManifest, diff, gateResults, syncMarkers, dateStr = new Date().toISOString() } = options;

  const lines: string[] = [
    `# Weekly Automated Catalog Snapshot Update (${dateStr.slice(0, 10)})`,
    "",
    "This automated pull request proposes updated static catalog snapshots exported from upstream synchronization.",
    "",
    "### Baseline & Upstream Sync Markers",
    `- **Baseline Created**: \`${baselineManifest?.createdAt ?? "None (First Baseline)"}\` (Ref: \`${baselineManifest?.provenance?.approvalReference ?? "N/A"}\`)`,
    `- **Catalog (Courses) Sync**: \`${syncMarkers?.catalog ?? "N/A"}\``,
    `- **Programs Sync**: \`${syncMarkers?.programs ?? "N/A"}\``,
    `- **Transfers Sync**: \`${syncMarkers?.transfers ?? "N/A"}\``,
    "",
    "### Catalog Inventory Summary",
    "",
    "| Domain | Baseline Count | Staged Count | Delta | SHA-256 Checksum |",
    "|---|---|---|---|---|",
    `| **Programs** | ${diff.programs.baseline} | ${diff.programs.staged} | ${diff.programs.delta >= 0 ? `+${diff.programs.delta}` : diff.programs.delta} | \`${stagedManifest.domains.programs.sha256.slice(0, 16)}...\` |`,
    `| **Courses** | ${diff.courses.baseline} | ${diff.courses.staged} | ${diff.courses.delta >= 0 ? `+${diff.courses.delta}` : diff.courses.delta} | \`${stagedManifest.domains.courses.sha256.slice(0, 16)}...\` |`,
    `| **Prerequisite Edges** | ${diff.prerequisites.baseline} | ${diff.prerequisites.staged} | ${diff.prerequisites.delta >= 0 ? `+${diff.prerequisites.delta}` : diff.prerequisites.delta} | — |`,
    `| **Transfers** | ${diff.transfers.baseline} | ${diff.transfers.staged} | ${diff.transfers.delta >= 0 ? `+${diff.transfers.delta}` : diff.transfers.delta} | \`${stagedManifest.domains.transfers.sha256.slice(0, 16)}...\` |`,
    `| **Search Index** | ${diff.search.baseline} | ${diff.search.staged} | ${diff.search.delta >= 0 ? `+${diff.search.delta}` : diff.search.delta} | \`${stagedManifest.domains.search.sha256.slice(0, 16)}...\` |`,
    "",
  ];

  if (diff.programs.added.length > 0 || diff.programs.removed.length > 0 || diff.programs.modified.length > 0) {
    lines.push("### Program Inventory Differences");
    if (diff.programs.added.length > 0) lines.push(`- **Added Programs**: ${diff.programs.added.join(", ")}`);
    if (diff.programs.removed.length > 0) lines.push(`- **Removed Programs**: ${diff.programs.removed.join(", ")}`);
    if (diff.programs.modified.length > 0) lines.push(`- **Modified Programs (${diff.programs.modified.length})**: ${diff.programs.modified.slice(0, 10).join(", ")}${diff.programs.modified.length > 10 ? "..." : ""}`);
    lines.push("");
  }

  lines.push("### Data Integrity Acceptance Gates");
  lines.push("");
  for (const [gateName, status] of Object.entries(gateResults.gates)) {
    const symbol = status.passed ? "✅" : "❌";
    lines.push(`- ${symbol} **${gateName}**: ${status.message}`);
  }
  lines.push("");

  lines.push("### Deployment & Review Instructions");
  lines.push("1. Verify CI checks pass (TypeScript, ESLint, Actionlint, Vitest, and isolated production build with `POSTGRES_URL` unset).");
  lines.push("2. Review the Vercel Preview deployment generated for this pull request.");
  lines.push("3. Merge this pull request targeting `main`. Vercel will deploy the approved static snapshots to production.");
  lines.push("4. **Rollback**: To rollback, revert this pull request or use Vercel instant rollback to the previous production deployment.");
  lines.push("");
  lines.push("---");
  lines.push("*Automated by `.github/workflows/weekly-snapshots.yml` with least-privilege credentials.*");

  return lines.join("\n");
}
