import { getAllTransferRows } from "./seoQueries";
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

  const normalized = normalizeTransferCourseCode(trimmed).toLowerCase();
  const matches = new Map<string, number>();
  for (const row of await getAllTransferRows()) { const id = row.courseNumber?.trim(); if (id && (id.toLowerCase().includes(normalized) || row.title?.toLowerCase().includes(trimmed.toLowerCase()))) matches.set(id, (matches.get(id) ?? 0) + 1); }
  return [...matches].sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([courseNumber, optionCount]) => ({ courseNumber, optionCount }));
}
