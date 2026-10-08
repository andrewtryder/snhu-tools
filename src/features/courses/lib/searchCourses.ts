import { getAllCourseSummaries } from "./courses";
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

  const normalized = normalizeCourseId(trimmed).toLowerCase();
  const q = trimmed.toLowerCase();
  return (await getAllCourseSummaries()).filter((course) => course.catalog_course_id.toLowerCase().includes(q) || course.catalog_course_id.toLowerCase().includes(normalized) || course.title.toLowerCase().includes(q)).sort((a, b) => a.catalog_course_id.localeCompare(b.catalog_course_id)).slice(0, limit);
}
