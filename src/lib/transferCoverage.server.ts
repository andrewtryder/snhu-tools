import "server-only";

import { getTransferCoverageResponse } from "@/features/transfers/lib/transferCoverage";
import type {
  TransferCoverageCourse,
  TransferCoverageResponse,
} from "@/features/transfers/lib/transferCoverage";
import { DegreeProgram } from "@/types/program";

export type { TransferCoverageCourse, TransferCoverageResponse } from "@/features/transfers/lib/transferCoverage";

export type TransferCoverageResult =
  | { status: "available"; data: TransferCoverageResponse }
  | { status: "unavailable" };

const MAX_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

export function collectProgramCoverageCourseCodes(program: DegreeProgram): string[] {
  return [
    ...new Set(
      program.nodes
        .filter(
          (course) => !course.isPlaceholder && !course.isExternal && course.code.trim() !== "",
        )
        .map((course) => course.code.toUpperCase().replace(/[\s-]+/g, "")),
    ),
  ];
}

/** Parse a coverage timestamp; returns null for null/invalid values. */
export function parseCoverageUpdatedAt(value: string | null): Date | null {
  if (value == null || value.trim() === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validateBatchResponse(
  requestedCodes: string[],
  response: TransferCoverageResponse,
): void {
  if (response.schemaVersion !== 1 || response.requestedCourseCount !== requestedCodes.length) {
    throw new Error("Transfer coverage batch metadata mismatch");
  }
  if (response.courses.length !== requestedCodes.length) {
    throw new Error("Transfer coverage batch course count mismatch");
  }

  const requested = new Set(requestedCodes);
  const returned = new Set<string>();
  for (const course of response.courses) {
    if (!requested.has(course.courseCode) || returned.has(course.courseCode)) {
      throw new Error("Transfer coverage batch contains invalid course codes");
    }
    returned.add(course.courseCode);
  }
  if (returned.size !== requested.size) {
    throw new Error("Transfer coverage batch omitted requested course codes");
  }

  const matchedCourseCount = response.courses.filter(
    (course) => course.hasTransferEquivalencies,
  ).length;
  if (response.matchedCourseCount !== matchedCourseCount) {
    throw new Error("Transfer coverage batch matched count mismatch");
  }
}

function mergeBatchResponses(
  requestedCodes: string[],
  batches: TransferCoverageResponse[],
): TransferCoverageResponse {
  const byCode = new Map<string, TransferCoverageCourse>();

  for (const batch of batches) {
    validateBatchResponse(batch.courses.map((course) => course.courseCode), batch);
    for (const course of batch.courses) {
      if (byCode.has(course.courseCode)) {
        throw new Error("Transfer coverage batches returned duplicate course codes");
      }
      byCode.set(course.courseCode, course);
    }
  }

  const courses = requestedCodes.map((courseCode) => {
    const course = byCode.get(courseCode);
    if (!course) throw new Error("Transfer coverage merge omitted requested course code");
    return course;
  });
  const dataLastUpdatedAt = batches.find((batch) => batch.dataLastUpdatedAt != null)?.dataLastUpdatedAt ?? null;
  if (dataLastUpdatedAt != null && !parseCoverageUpdatedAt(dataLastUpdatedAt)) {
    throw new Error("Transfer coverage merge has an invalid timestamp");
  }

  return {
    schemaVersion: 1,
    dataLastUpdatedAt,
    requestedCourseCount: requestedCodes.length,
    matchedCourseCount: courses.filter((course) => course.hasTransferEquivalencies).length,
    courses,
  };
}

/**
 * Live transfer-equivalency coverage for a program, obtained from the local
 * Transfers domain service. Infrastructure failures remain distinct from zero
 * coverage so the Programs UI can render its unavailable state.
 */
export async function getProgramTransferCoverage(
  program: DegreeProgram,
): Promise<TransferCoverageResult> {
  const courseCodes = collectProgramCoverageCourseCodes(program);

  if (courseCodes.length === 0) {
    return {
      status: "available",
      data: {
        schemaVersion: 1,
        dataLastUpdatedAt: null,
        requestedCourseCount: 0,
        matchedCourseCount: 0,
        courses: [],
      },
    };
  }

  try {
    const responses: TransferCoverageResponse[] = [];
    for (const batch of chunk(courseCodes, MAX_BATCH_SIZE)) {
      responses.push(await getTransferCoverageResponse(batch));
    }
    return { status: "available", data: mergeBatchResponses(courseCodes, responses) };
  } catch (error) {
    console.error("[program-transfer-coverage] Transfer data unavailable", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return { status: "unavailable" };
  }
}
