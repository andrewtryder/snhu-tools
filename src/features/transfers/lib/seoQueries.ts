import { asc, count, eq, isNotNull, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { db } from "@/features/transfers/db";
import { transferCourses } from "@/features/transfers/db/schema";
import {
  TRANSFER_CACHE_REVALIDATE,
  TRANSFER_CACHE_TAG,
  TRANSFER_SYNC_ID,
} from "./constants";
import { normalizeCourseNumber, slugify } from "./slug";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransferRow = {
  subjectPrefix: string | null;
  courseNumber: string | null;
  title: string | null;
  pid: string | null;
  eligibilityTimeframe: string | null;
  groupFilter2Name: string | null;
  academicLevel: string | null;
  coursePID: string | null;
};

export type FacetSummary = {
  value: string;
  count: number;
  slug: string;
};

export type DirectoryEntry = {
  value: string;
  count: number;
  slug: string;
};

export type CourseDirectoryEntry = DirectoryEntry & {
  subjectPrefix: string;
};

// ---------------------------------------------------------------------------
// Private DB helpers — not exported; use cached wrappers below
// ---------------------------------------------------------------------------

async function _dbGetAllTransferRows(): Promise<TransferRow[]> {
  return db
    .select({
      subjectPrefix: transferCourses.subjectPrefix,
      courseNumber: transferCourses.courseNumber,
      title: transferCourses.title,
      pid: transferCourses.pid,
      eligibilityTimeframe: transferCourses.eligibilityTimeframe,
      groupFilter2Name: transferCourses.groupFilter2Name,
      academicLevel: transferCourses.academicLevel,
      coursePID: transferCourses.coursePID,
    })
    .from(transferCourses)
    .orderBy(asc(transferCourses.courseNumber));
}

async function _dbGetDistinctSubjects(): Promise<string[]> {
  const result = await db.execute<{ value: string }>(
    sql`SELECT DISTINCT TRIM(subjectprefix) AS value
        FROM transfer_courses
        WHERE subjectprefix IS NOT NULL
          AND TRIM(subjectprefix) != ''
        ORDER BY 1`
  );
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return (rows as { value: string }[]).map((r) => r.value);
}

async function _dbGetDistinctOrganizations(): Promise<string[]> {
  const result = await db.execute<{ value: string }>(
    sql`SELECT DISTINCT TRIM(groupfilter2name) AS value
        FROM transfer_courses
        WHERE groupfilter2name IS NOT NULL
          AND TRIM(groupfilter2name) != ''
        ORDER BY 1`
  );
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return (rows as { value: string }[]).map((r) => r.value);
}

async function _dbGetDistinctLevels(): Promise<string[]> {
  const result = await db.execute<{ value: string }>(
    sql`SELECT DISTINCT TRIM(academiclevel) AS value
        FROM transfer_courses
        WHERE academiclevel IS NOT NULL
          AND TRIM(academiclevel) != ''
        ORDER BY 1`
  );
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return (rows as { value: string }[]).map((r) => r.value);
}

async function _dbGetDistinctCourseNumbers(): Promise<string[]> {
  const result = await db.execute<{ value: string }>(
    sql`SELECT DISTINCT TRIM(coursenumber) AS value
        FROM transfer_courses
        WHERE coursenumber IS NOT NULL
          AND TRIM(coursenumber) != ''
        ORDER BY 1`
  );
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return (rows as { value: string }[]).map((r) => r.value);
}

function _toDirectoryEntries(
  rows: Array<{ value: string | null; count: number }>
): DirectoryEntry[] {
  const map = new Map<string, number>();

  for (const row of rows) {
    const value = (row.value ?? "").trim();
    if (!value) continue;
    map.set(value, (map.get(value) ?? 0) + Number(row.count));
  }

  return Array.from(map.entries())
    .map(([value, entryCount]) => ({ value, count: entryCount, slug: slugify(value) }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

async function _dbGetSubjectDirectoryEntries(): Promise<DirectoryEntry[]> {
  const rows = await db
    .select({
      value: transferCourses.subjectPrefix,
      count: count(),
    })
    .from(transferCourses)
    .where(isNotNull(transferCourses.subjectPrefix))
    .groupBy(transferCourses.subjectPrefix);

  return _toDirectoryEntries(rows);
}

async function _dbGetOrganizationDirectoryEntries(): Promise<DirectoryEntry[]> {
  const rows = await db
    .select({
      value: transferCourses.groupFilter2Name,
      count: count(),
    })
    .from(transferCourses)
    .where(isNotNull(transferCourses.groupFilter2Name))
    .groupBy(transferCourses.groupFilter2Name);

  return _toDirectoryEntries(rows);
}

async function _dbGetLevelDirectoryEntries(): Promise<DirectoryEntry[]> {
  const rows = await db
    .select({
      value: transferCourses.academicLevel,
      count: count(),
    })
    .from(transferCourses)
    .where(isNotNull(transferCourses.academicLevel))
    .groupBy(transferCourses.academicLevel);

  return _toDirectoryEntries(rows);
}

async function _dbGetCourseDirectoryEntries(): Promise<CourseDirectoryEntry[]> {
  const rows = await db
    .select({
      courseNumber: transferCourses.courseNumber,
      subjectPrefix: transferCourses.subjectPrefix,
      count: count(),
    })
    .from(transferCourses)
    .where(isNotNull(transferCourses.courseNumber))
    .groupBy(transferCourses.courseNumber, transferCourses.subjectPrefix);

  const map = new Map<string, CourseDirectoryEntry>();

  for (const row of rows) {
    const value = (row.courseNumber ?? "").trim();
    if (!value) continue;

    const subjectPrefix = (row.subjectPrefix ?? "").trim();
    const key = `${subjectPrefix}\0${value}`;
    const existing = map.get(key);
    const entryCount = Number(row.count);

    if (existing) {
      existing.count += entryCount;
    } else {
      map.set(key, {
        value,
        subjectPrefix,
        count: entryCount,
        slug: slugify(value),
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      a.subjectPrefix.localeCompare(b.subjectPrefix) || a.value.localeCompare(b.value)
  );
}

async function _dbGetRowsBySubject(subjectPrefix: string): Promise<TransferRow[]> {
  return db
    .select({
      subjectPrefix: transferCourses.subjectPrefix,
      courseNumber: transferCourses.courseNumber,
      title: transferCourses.title,
      pid: transferCourses.pid,
      eligibilityTimeframe: transferCourses.eligibilityTimeframe,
      groupFilter2Name: transferCourses.groupFilter2Name,
      academicLevel: transferCourses.academicLevel,
      coursePID: transferCourses.coursePID,
    })
    .from(transferCourses)
    .where(eq(transferCourses.subjectPrefix, subjectPrefix))
    .orderBy(asc(transferCourses.courseNumber), asc(transferCourses.groupFilter2Name));
}

async function _dbGetRowsByOrganization(organization: string): Promise<TransferRow[]> {
  return db
    .select({
      subjectPrefix: transferCourses.subjectPrefix,
      courseNumber: transferCourses.courseNumber,
      title: transferCourses.title,
      pid: transferCourses.pid,
      eligibilityTimeframe: transferCourses.eligibilityTimeframe,
      groupFilter2Name: transferCourses.groupFilter2Name,
      academicLevel: transferCourses.academicLevel,
      coursePID: transferCourses.coursePID,
    })
    .from(transferCourses)
    .where(eq(transferCourses.groupFilter2Name, organization))
    .orderBy(asc(transferCourses.courseNumber), asc(transferCourses.title));
}

async function _dbGetRowsByLevel(level: string): Promise<TransferRow[]> {
  return db
    .select({
      subjectPrefix: transferCourses.subjectPrefix,
      courseNumber: transferCourses.courseNumber,
      title: transferCourses.title,
      pid: transferCourses.pid,
      eligibilityTimeframe: transferCourses.eligibilityTimeframe,
      groupFilter2Name: transferCourses.groupFilter2Name,
      academicLevel: transferCourses.academicLevel,
      coursePID: transferCourses.coursePID,
    })
    .from(transferCourses)
    .where(eq(transferCourses.academicLevel, level))
    .orderBy(asc(transferCourses.courseNumber), asc(transferCourses.groupFilter2Name));
}

async function _dbGetRowsByCourseNumber(courseNumber: string): Promise<TransferRow[]> {
  return db
    .select({
      subjectPrefix: transferCourses.subjectPrefix,
      courseNumber: transferCourses.courseNumber,
      title: transferCourses.title,
      pid: transferCourses.pid,
      eligibilityTimeframe: transferCourses.eligibilityTimeframe,
      groupFilter2Name: transferCourses.groupFilter2Name,
      academicLevel: transferCourses.academicLevel,
      coursePID: transferCourses.coursePID,
    })
    .from(transferCourses)
    .where(eq(transferCourses.courseNumber, courseNumber))
    .orderBy(asc(transferCourses.groupFilter2Name), asc(transferCourses.title));
}

async function _dbGetTransferLastModified(): Promise<Date | null> {
  const result = await db.execute(
    sql`SELECT completed_at FROM transfer_sync_state WHERE id = ${TRANSFER_SYNC_ID}`
  );

  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] }).rows ?? []);

  if (rows.length === 0) return null;

  const raw = (rows[0] as { completed_at?: unknown }).completed_at;
  if (raw == null) return null;

  const date = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

// ---------------------------------------------------------------------------
// Cached slug maps — one per dimension, keyed slug → canonical value
// ---------------------------------------------------------------------------

const _cachedSubjectSlugMap = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const values = await _dbGetDistinctSubjects();
    return Object.fromEntries(values.map((v) => [slugify(v), v]));
  },
  ["subject-slug-map"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

const _cachedOrganizationSlugMap = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const values = await _dbGetDistinctOrganizations();
    return Object.fromEntries(values.map((v) => [slugify(v), v]));
  },
  ["organization-slug-map"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

const _cachedLevelSlugMap = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const values = await _dbGetDistinctLevels();
    return Object.fromEntries(values.map((v) => [slugify(v), v]));
  },
  ["level-slug-map"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

// ---------------------------------------------------------------------------
// Public cached wrappers — these are what the app imports
// ---------------------------------------------------------------------------

/** Full transfer dataset, cached for 7 days and tagged 'transfer-data'. */
const _cachedAllTransferRows = unstable_cache(
  _dbGetAllTransferRows,
  ["all-transfer-rows"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

/**
 * Sorted unique subject prefixes, resolved in SQL (no JS deduplication).
 * Cached for 7 days and tagged 'transfer-data'.
 */
const _cachedDistinctSubjects = unstable_cache(
  _dbGetDistinctSubjects,
  ["distinct-subjects"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

/**
 * Sorted unique organization names, resolved in SQL (no JS deduplication).
 * Cached for 7 days and tagged 'transfer-data'.
 */
const _cachedDistinctOrganizations = unstable_cache(
  _dbGetDistinctOrganizations,
  ["distinct-organizations"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

/**
 * Sorted unique academic levels, resolved in SQL (no JS deduplication).
 * Cached for 7 days and tagged 'transfer-data'.
 */
const _cachedDistinctLevels = unstable_cache(
  _dbGetDistinctLevels,
  ["distinct-levels"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

/**
 * Sorted unique course numbers, resolved in SQL (no JS deduplication).
 * Cached for 7 days and tagged 'transfer-data'.
 */
const _cachedDistinctCourseNumbers = unstable_cache(
  _dbGetDistinctCourseNumbers,
  ["distinct-course-numbers"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

const _cachedSubjectDirectoryEntries = unstable_cache(
  _dbGetSubjectDirectoryEntries,
  ["subject-directory"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

const _cachedOrganizationDirectoryEntries = unstable_cache(
  _dbGetOrganizationDirectoryEntries,
  ["organization-directory"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

const _cachedLevelDirectoryEntries = unstable_cache(
  _dbGetLevelDirectoryEntries,
  ["level-directory"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

const _cachedCourseDirectoryEntries = unstable_cache(
  _dbGetCourseDirectoryEntries,
  ["course-directory"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

const _cachedTransferLastModified = unstable_cache(
  _dbGetTransferLastModified,
  ["transfer-last-modified"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

/** Cached rows for a single subject prefix. Key includes the subject value. */
const _cachedRowsBySubject = unstable_cache(
  _dbGetRowsBySubject,
  ["rows-by-subject"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

/** Cached rows for a single organization. Key includes the organization value. */
const _cachedRowsByOrganization = unstable_cache(
  _dbGetRowsByOrganization,
  ["rows-by-organization"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

/** Cached rows for a single academic level. Key includes the level value. */
const _cachedRowsByLevel = unstable_cache(
  _dbGetRowsByLevel,
  ["rows-by-level"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

/**
 * Cached rows for a course number. Input is automatically normalized to
 * uppercase before the query and the cache key.
 */
const _cachedRowsByCourseNumber = unstable_cache(
  _dbGetRowsByCourseNumber,
  ["rows-by-course-number"],
  { tags: [TRANSFER_CACHE_TAG], revalidate: TRANSFER_CACHE_REVALIDATE }
);

// React request memoization prevents generateMetadata() and page rendering
// from repeating a persistent-cache lookup in the same render request.
export const getAllTransferRows = cache(() => _cachedAllTransferRows());
export const getDistinctSubjects = cache(() => _cachedDistinctSubjects());
export const getDistinctOrganizations = cache(() => _cachedDistinctOrganizations());
export const getDistinctLevels = cache(() => _cachedDistinctLevels());
export const getDistinctCourseNumbers = cache(() => _cachedDistinctCourseNumbers());
export const getSubjectDirectoryEntries = cache(() => _cachedSubjectDirectoryEntries());
export const getOrganizationDirectoryEntries = cache(() => _cachedOrganizationDirectoryEntries());
export const getLevelDirectoryEntries = cache(() => _cachedLevelDirectoryEntries());
export const getCourseDirectoryEntries = cache(() => _cachedCourseDirectoryEntries());
export const getTransferLastModified = cache(() => _cachedTransferLastModified());
const _getRowsBySubject = cache((subjectPrefix: string) => _cachedRowsBySubject(subjectPrefix));
const _getRowsByOrganization = cache((organization: string) => _cachedRowsByOrganization(organization));
const _getRowsByLevel = cache((level: string) => _cachedRowsByLevel(level));
const _getRowsByCourseNumber = cache((courseNumber: string) => _cachedRowsByCourseNumber(courseNumber));

// Normalize before both React and Next persistent cache keys are constructed.
export function getRowsBySubject(subjectPrefix: string) {
  return _getRowsBySubject(subjectPrefix.trim());
}
export function getRowsByOrganization(organization: string) {
  return _getRowsByOrganization(organization.trim());
}
export function getRowsByLevel(level: string) {
  return _getRowsByLevel(level.trim());
}
export function getRowsByCourseNumber(courseNumber: string) {
  return _getRowsByCourseNumber(normalizeCourseNumber(courseNumber));
}

// ---------------------------------------------------------------------------
// Pure helpers — no DB access
// ---------------------------------------------------------------------------

/**
 * Build facet summaries from an already-loaded set of transfer rows.
 *
 * This is a PURE function — it does NOT query the database.
 * Pass the rows already fetched by getAllTransferRows() to avoid a second
 * full-table read on homepage generation.
 */
export function buildFacetSummaries(
  rows: TransferRow[],
  limit = 20
): {
  subjects: FacetSummary[];
  organizations: FacetSummary[];
  levels: FacetSummary[];
  courses: FacetSummary[];
} {
  const build = (values: Array<string | null>): FacetSummary[] => {
    const map = new Map<string, number>();
    values.forEach((raw) => {
      const value = (raw ?? "").trim();
      if (!value) return;
      map.set(value, (map.get(value) ?? 0) + 1);
    });

    return Array.from(map.entries())
      .map(([value, cnt]) => ({ value, count: cnt, slug: slugify(value) }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, limit);
  };

  return {
    subjects: build(rows.map((r) => r.subjectPrefix)),
    organizations: build(rows.map((r) => r.groupFilter2Name)),
    levels: build(rows.map((r) => r.academicLevel)),
    courses: build(rows.map((r) => r.courseNumber)),
  };
}

export function getRelatedFacets(rows: TransferRow[]) {
  const subjects = Array.from(new Set(rows.map((r) => r.subjectPrefix).filter(Boolean) as string[])).sort();
  const organizations = Array.from(new Set(rows.map((r) => r.groupFilter2Name).filter(Boolean) as string[])).sort();
  const levels = Array.from(new Set(rows.map((r) => r.academicLevel).filter(Boolean) as string[])).sort();
  const courses = Array.from(new Set(rows.map((r) => r.courseNumber).filter(Boolean) as string[])).sort();

  return { subjects, organizations, levels, courses };
}

// ---------------------------------------------------------------------------
// Slug resolution using cached maps
// ---------------------------------------------------------------------------

/**
 * Resolve a subject slug to its canonical database value.
 * Uses a cached slug→value map to avoid a full distinct query per call.
 */
const _resolveSubjectBySlug = cache(async (slug: string): Promise<string | null> => {
  const map = await _cachedSubjectSlugMap();
  return map[slug] ?? null;
});
export function resolveSubjectBySlug(slug: string) {
  return _resolveSubjectBySlug(slugify(slug));
}

/**
 * Resolve an organization slug to its canonical database value.
 * Uses a cached slug→value map to avoid a full distinct query per call.
 */
const _resolveOrganizationBySlug = cache(async (slug: string): Promise<string | null> => {
  const map = await _cachedOrganizationSlugMap();
  return map[slug] ?? null;
});
export function resolveOrganizationBySlug(slug: string) {
  return _resolveOrganizationBySlug(slugify(slug));
}

/**
 * Resolve a level slug to its canonical database value.
 * Uses a cached slug→value map to avoid a full distinct query per call.
 */
const _resolveLevelBySlug = cache(async (slug: string): Promise<string | null> => {
  const map = await _cachedLevelSlugMap();
  return map[slug] ?? null;
});
export function resolveLevelBySlug(slug: string) {
  return _resolveLevelBySlug(slugify(slug));
}
