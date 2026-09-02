import { withPoolClient } from "@/features/courses/db/pool";
import { normalizeCourseId } from "./courseIds";

export interface CourseSearchResult {
  catalog_course_id: string;
  title: string;
}

export interface SearchCoursesOptions {
  limit?: number;
}

export async function searchCourses(
  query: string,
  options: SearchCoursesOptions = {}
): Promise<CourseSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 1) {
    return [];
  }

  const parsedLimit = options.limit ?? 10;
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 10, 1), 50);

  const normalized = normalizeCourseId(trimmed);
  const prefixPattern = `${trimmed}%`;
  const containsPattern = `%${trimmed}%`;
  const normalizedPrefixPattern = `${normalized}%`;
  const normalizedContainsPattern = `%${normalized}%`;

  return withPoolClient(async (client) => {
    const result = await client.sql`
      SELECT
        catalog_course_id,
        title
      FROM courses_data
      WHERE (
        catalog_course_id ILIKE ${containsPattern}
        OR catalog_course_id ILIKE ${normalizedContainsPattern}
        OR title ILIKE ${containsPattern}
      )
      ORDER BY
        CASE
          WHEN UPPER(catalog_course_id) = ${normalized} THEN 1
          WHEN catalog_course_id ILIKE ${prefixPattern} OR catalog_course_id ILIKE ${normalizedPrefixPattern} THEN 2
          WHEN catalog_course_id ILIKE ${containsPattern} OR catalog_course_id ILIKE ${normalizedContainsPattern} THEN 3
          WHEN title ILIKE ${prefixPattern} THEN 4
          WHEN title ILIKE ${containsPattern} THEN 5
          ELSE 6
        END,
        catalog_course_id ASC
      LIMIT ${limit}
    `;
    return result.rows as CourseSearchResult[];
  });
}
