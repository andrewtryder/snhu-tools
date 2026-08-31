import { inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/features/transfers/db";
import { transferCourses } from "@/features/transfers/db/schema";
import { getSiteUrl } from "@/lib/siteUrl";
import {
  TRANSFER_COVERAGE_CACHE_TAG,
  TRANSFER_COVERAGE_REVALIDATE_SECONDS,
} from "./constants";
import { formatTransferCourseCode } from "./courseCode";
import { getTransferLastModified } from "./seoQueries";
import { canonicalPath, slugify } from "./slug";

export type TransferCoverageCourse = {
  courseCode: string;
  displayCourseCode: string;
  hasTransferEquivalencies: boolean;
  equivalencyCount: number;
  providerCount: number;
  providers: string[];
  courseUrl: string;
};

export type TransferCoverageResponse = {
  schemaVersion: 1;
  dataLastUpdatedAt: string | null;
  requestedCourseCount: number;
  matchedCourseCount: number;
  courses: TransferCoverageCourse[];
};

export type TransferCoverageRow = {
  courseNumber: string | null;
  pid: string | null;
  groupFilter2Name: string | null;
};

type CourseAggregate = {
  pids: Set<string>;
  rowCount: number;
  providers: Set<string>;
};

/**
 * Single parameterized batch read against the live `transfer_courses` table.
 * Does not touch staging, sync leases, or mutation paths.
 */
export async function fetchTransferCoverageRows(
  courseCodes: string[]
): Promise<TransferCoverageRow[]> {
  if (courseCodes.length === 0) return [];

  return db
    .select({
      courseNumber: transferCourses.courseNumber,
      pid: transferCourses.pid,
      groupFilter2Name: transferCourses.groupFilter2Name,
    })
    .from(transferCourses)
    .where(inArray(transferCourses.courseNumber, courseCodes));
}

const _cachedTransferCoverageRows = unstable_cache(
  async (sortedCodesKey: string): Promise<TransferCoverageRow[]> => {
    const codes = sortedCodesKey.length === 0 ? [] : sortedCodesKey.split(",");
    return fetchTransferCoverageRows(codes);
  },
  ["transfer-coverage-rows"],
  {
    tags: [TRANSFER_COVERAGE_CACHE_TAG],
    revalidate: TRANSFER_COVERAGE_REVALIDATE_SECONDS,
  }
);

function buildAggregates(rows: TransferCoverageRow[]): Map<string, CourseAggregate> {
  const byCourse = new Map<string, CourseAggregate>();

  for (const row of rows) {
    const courseNumber = (row.courseNumber ?? "").trim().toUpperCase();
    if (!courseNumber) continue;

    let aggregate = byCourse.get(courseNumber);
    if (!aggregate) {
      aggregate = { pids: new Set(), rowCount: 0, providers: new Set() };
      byCourse.set(courseNumber, aggregate);
    }

    aggregate.rowCount += 1;

    const pid = (row.pid ?? "").trim();
    if (pid) {
      aggregate.pids.add(pid);
    }

    const provider = (row.groupFilter2Name ?? "").trim();
    if (provider) {
      aggregate.providers.add(provider);
    }
  }

  return byCourse;
}

function equivalencyCountFor(aggregate: CourseAggregate | undefined): number {
  if (!aggregate) return 0;
  // Prefer distinct experience PIDs; fall back to row count only when pid is absent.
  if (aggregate.pids.size > 0) return aggregate.pids.size;
  return aggregate.rowCount;
}

/**
 * `unstable_cache` may rehydrate timestamps as ISO strings rather than Date.
 */
export function toDataLastUpdatedAt(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Pure aggregation: map batch rows onto the ordered request list.
 * Unmatched courses are returned explicitly with zero coverage.
 */
export function aggregateTransferCoverage(
  courseCodes: string[],
  rows: TransferCoverageRow[],
  dataLastUpdatedAt: Date | string | null,
  baseUrl: string = getSiteUrl()
): TransferCoverageResponse {
  const aggregates = buildAggregates(rows);

  const courses: TransferCoverageCourse[] = courseCodes.map((courseCode) => {
    const aggregate = aggregates.get(courseCode);
    const equivalencyCount = equivalencyCountFor(aggregate);
    const providers = aggregate
      ? Array.from(aggregate.providers).sort((a, b) => a.localeCompare(b))
      : [];

    return {
      courseCode,
      displayCourseCode: formatTransferCourseCode(courseCode),
      hasTransferEquivalencies: equivalencyCount > 0,
      equivalencyCount,
      providerCount: providers.length,
      providers,
      courseUrl: canonicalPath(`/transfers/courses/${slugify(courseCode)}`, baseUrl),
    };
  });

  return {
    schemaVersion: 1,
    dataLastUpdatedAt: toDataLastUpdatedAt(dataLastUpdatedAt),
    requestedCourseCount: courseCodes.length,
    matchedCourseCount: courses.filter((course) => course.hasTransferEquivalencies).length,
    courses,
  };
}

/**
 * Load transfer-coverage for a bounded list of already-normalized course codes.
 * Cache key uses a sorted codes list; response order follows `courseCodes`.
 */
export async function getTransferCoverageResponse(
  courseCodes: string[]
): Promise<TransferCoverageResponse> {
  const sortedCodesKey = [...courseCodes].sort((a, b) => a.localeCompare(b)).join(",");

  const [rows, lastModified] = await Promise.all([
    _cachedTransferCoverageRows(sortedCodesKey),
    getTransferLastModified(),
  ]);

  return aggregateTransferCoverage(courseCodes, rows, lastModified, getSiteUrl());
}
