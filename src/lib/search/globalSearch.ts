import { searchPrograms } from "@/lib/serverData";
import { searchCourses } from "@/features/courses/lib/searchCourses";
import { coursePath } from "@/features/courses/lib/courseIds";
import { searchTransferCourses } from "@/features/transfers/lib/searchTransferCourses";
import { transferCoursePath } from "@/features/transfers/lib/slug";
import type {
  GlobalSearchResponse,
  GlobalSearchResult,
  SearchDomain,
  SearchOptions,
} from "./types";

export async function searchAll(
  query: string,
  options: SearchOptions = {}
): Promise<GlobalSearchResponse> {
  const trimmed = query.trim();
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);

  const emptyResponse: GlobalSearchResponse = {
    query: trimmed,
    results: {
      programs: [],
      courses: [],
      transfers: [],
    },
    counts: {
      programs: 0,
      courses: 0,
      transfers: 0,
      total: 0,
    },
  };

  if (trimmed.length < 2) {
    return emptyResponse;
  }

  const unavailable: SearchDomain[] = [];
  const programResults: GlobalSearchResult[] = [];
  const courseResults: GlobalSearchResult[] = [];
  const transferResults: GlobalSearchResult[] = [];

  // Sequential execution to avoid connection contention against max=1 unified pool
  // 1. Programs
  try {
    const rawPrograms = await searchPrograms(trimmed, { limit });
    for (const p of rawPrograms) {
      programResults.push({
        type: "program",
        id: p.slug,
        title: p.title,
        subtitle: p.credential || p.degreeLevel || null,
        href: `/programs/${p.slug}`,
      });
    }
  } catch (err) {
    console.error("[globalSearch] Programs search error:", (err as Error).message);
    unavailable.push("programs");
  }

  // 2. Courses
  try {
    const rawCourses = await searchCourses(trimmed, { limit });
    for (const c of rawCourses) {
      courseResults.push({
        type: "course",
        id: c.catalog_course_id,
        title: c.catalog_course_id,
        subtitle: c.title || null,
        href: coursePath(c.catalog_course_id),
      });
    }
  } catch (err) {
    console.error("[globalSearch] Courses search error:", (err as Error).message);
    unavailable.push("courses");
  }

  // 3. Transfers
  try {
    const rawTransfers = await searchTransferCourses(trimmed, { limit });
    for (const t of rawTransfers) {
      transferResults.push({
        type: "transfer",
        id: t.courseNumber,
        title: t.courseNumber,
        subtitle: `${t.optionCount} transfer ${t.optionCount === 1 ? "option" : "options"}`,
        href: transferCoursePath(t.courseNumber),
        optionCount: t.optionCount,
      });
    }
  } catch (err) {
    console.error("[globalSearch] Transfers search error:", (err as Error).message);
    unavailable.push("transfers");
  }

  const counts = {
    programs: programResults.length,
    courses: courseResults.length,
    transfers: transferResults.length,
    total: programResults.length + courseResults.length + transferResults.length,
  };

  const response: GlobalSearchResponse = {
    query: trimmed,
    results: {
      programs: programResults,
      courses: courseResults,
      transfers: transferResults,
    },
    counts,
  };

  if (unavailable.length > 0) {
    response.unavailable = unavailable;
  }

  return response;
}
