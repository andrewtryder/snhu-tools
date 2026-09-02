import { sql } from "drizzle-orm";
import { db } from "@/features/transfers/db";
import { normalizeTransferCourseCode } from "./courseCode";

export interface TransferCourseSearchResult {
  courseNumber: string;
  optionCount: number;
}

export interface SearchTransferCoursesOptions {
  limit?: number;
}

export async function searchTransferCourses(
  query: string,
  options: SearchTransferCoursesOptions = {}
): Promise<TransferCourseSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 1) {
    return [];
  }

  const parsedLimit = options.limit ?? 10;
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 10, 1), 50);

  const normalized = normalizeTransferCourseCode(trimmed);
  const prefixPattern = `${trimmed}%`;
  const containsPattern = `%${trimmed}%`;
  const normalizedPrefixPattern = `${normalized}%`;
  const normalizedContainsPattern = `%${normalized}%`;

  const result = await db.execute<{
    courseNumber: string;
    optionCount: number;
  }>(sql`
    SELECT
      TRIM(coursenumber) AS "courseNumber",
      COUNT(*)::int AS "optionCount"
    FROM transfer_courses
    WHERE coursenumber IS NOT NULL AND TRIM(coursenumber) != ''
      AND (
        coursenumber ILIKE ${containsPattern}
        OR coursenumber ILIKE ${normalizedContainsPattern}
        OR title ILIKE ${containsPattern}
      )
    GROUP BY TRIM(coursenumber)
    ORDER BY
      CASE
        WHEN UPPER(TRIM(coursenumber)) = ${normalized} THEN 1
        WHEN TRIM(coursenumber) ILIKE ${prefixPattern} OR TRIM(coursenumber) ILIKE ${normalizedPrefixPattern} THEN 2
        WHEN TRIM(coursenumber) ILIKE ${containsPattern} OR TRIM(coursenumber) ILIKE ${normalizedContainsPattern} THEN 3
        WHEN BOOL_OR(title ILIKE ${prefixPattern}) THEN 4
        ELSE 5
      END,
      "optionCount" DESC,
      "courseNumber" ASC
    LIMIT ${limit}
  `);

  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return (rows as { courseNumber: string; optionCount: number }[]).map((r) => ({
    courseNumber: r.courseNumber,
    optionCount: Number(r.optionCount) || 0,
  }));
}
