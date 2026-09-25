import { cache } from "react";
import type {
  SearchCourseEntry,
  SearchIndexSnapshot,
  SearchProgramEntry,
  SearchTransferEntry,
} from "@/lib/snapshots/domains/search";
import { durableCache } from "@/lib/snapshots/cache";
import { readThroughSnapshot } from "@/lib/snapshots/readThrough";
import { normalizeCourseId } from "@/features/courses/lib/courseIds";
import { normalizeTransferCourseCode } from "@/features/transfers/lib/courseCode";
import { getCourseCodeKey } from "@/lib/courseCode";
import { normalizeDegreeLevel } from "@/lib/kualiParser";

async function loadSearchIndexFromSnapshot(): Promise<SearchIndexSnapshot | null> {
  const result = await readThroughSnapshot<SearchIndexSnapshot>({
    domain: "search",
    cacheKey: "search.index",
    preferSnapshot: true,
    loadFromDatabase: async () =>
      ({ programs: [], courses: [], transfers: [] }) as unknown as SearchIndexSnapshot,
    fromBundle: (b) => b as SearchIndexSnapshot,
    validate: (b) => {
      const total =
        (b?.programs?.length ?? 0) + (b?.courses?.length ?? 0) + (b?.transfers?.length ?? 0);
      return total > 0;
    },
  });
  return result.value;
}

export const getSearchIndexSnapshotCached = durableCache(
  loadSearchIndexFromSnapshot,
  ["search-index-snapshot"],
  { tags: ["program-data", "catalog-data", "transfer-data"], revalidate: false },
);

export const getSearchIndexRequestCached = cache(() => getSearchIndexSnapshotCached());

function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function startsWithInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().startsWith(needle.toLowerCase());
}

function rankProgram(entry: SearchProgramEntry, q: string, courseCodeKey: string): number {
  const title = entry.title ?? "";
  const credential = entry.credential ?? "";
  const slug = entry.slug ?? "";
  if (title.toLowerCase() === q.toLowerCase()) return 1;
  if (startsWithInsensitive(title, q)) return 2;
  if (includesInsensitive(title, q)) return 3;
  if (includesInsensitive(credential, q) || includesInsensitive(slug, q)) return 4;
  if (courseCodeKey && getCourseCodeKey(title) === courseCodeKey) return 5;
  return 99;
}

function rankCourse(entry: SearchCourseEntry, q: string, normalized: string): number {
  const id = entry.id ?? "";
  const title = entry.title ?? "";
  const idUpper = id.toUpperCase();
  if (idUpper === normalized) return 1;
  if (startsWithInsensitive(id, q) || startsWithInsensitive(id, normalized)) return 2;
  if (includesInsensitive(id, q) || includesInsensitive(id, normalized)) return 3;
  if (startsWithInsensitive(title, q)) return 4;
  if (includesInsensitive(title, q)) return 5;
  return 99;
}

function rankTransfer(
  entry: SearchTransferEntry,
  q: string,
  normalized: string,
): number {
  const courseNumber = entry.courseNumber ?? "";
  const title = entry.title ?? "";
  const numUpper = courseNumber.toUpperCase();
  if (numUpper === normalized) return 1;
  if (startsWithInsensitive(courseNumber, q) || startsWithInsensitive(courseNumber, normalized))
    return 2;
  if (includesInsensitive(courseNumber, q) || includesInsensitive(courseNumber, normalized))
    return 3;
  if (startsWithInsensitive(title, q)) return 4;
  if (includesInsensitive(title, q)) return 5;
  return 99;
}

export async function searchProgramsFromSnapshot(
  query: string,
  options: { limit?: number; level?: string } = {},
): Promise<Array<{
  slug: string;
  title: string;
  credential: string;
  degreeLevel: string;
  matchedText?: string;
}> | null> {
  const index = await getSearchIndexRequestCached();
  if (!index) return null;

  const q = query.trim();
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 30);
  const courseCodeKey = getCourseCodeKey(q);
  const level = options.level && options.level !== "ALL" ? options.level : null;

  const ranked = index.programs
    .filter((p) => {
      if (level) {
        const degreeLevel = p.degreeLevel || normalizeDegreeLevel(p.credential);
        if (degreeLevel !== level && !includesInsensitive(p.credential, level)) {
          return false;
        }
      }
      return rankProgram(p, q, courseCodeKey) < 99;
    })
    .map((p) => ({
      entry: p,
      rank: rankProgram(p, q, courseCodeKey),
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank || a.entry.title.localeCompare(b.entry.title),
    )
    .slice(0, limit);

  return ranked.map(({ entry }) => ({
    slug: entry.slug,
    title: entry.title,
    credential: entry.credential,
    degreeLevel: entry.degreeLevel || normalizeDegreeLevel(entry.credential),
    matchedText: entry.title,
  }));
}

export async function searchCoursesFromSnapshot(
  query: string,
  options: { limit?: number } = {},
): Promise<Array<{ catalog_course_id: string; title: string }> | null> {
  const index = await getSearchIndexRequestCached();
  if (!index) return null;

  const q = query.trim();
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const normalized = normalizeCourseId(q);

  const ranked = index.courses
    .map((c) => ({ entry: c, rank: rankCourse(c, q, normalized) }))
    .filter((r) => r.rank < 99)
    .sort(
      (a, b) =>
        a.rank - b.rank || a.entry.id.localeCompare(b.entry.id),
    )
    .slice(0, limit);

  return ranked.map(({ entry }) => ({
    catalog_course_id: entry.id,
    title: entry.title,
  }));
}

export async function searchTransfersFromSnapshot(
  query: string,
  options: { limit?: number } = {},
): Promise<Array<{ courseNumber: string; optionCount: number }> | null> {
  const index = await getSearchIndexRequestCached();
  if (!index) return null;

  const q = query.trim();
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const normalized = normalizeTransferCourseCode(q);

  const counts = new Map<string, { title: string; optionCount: number; bestRank: number }>();
  for (const entry of index.transfers) {
    const rank = rankTransfer(entry, q, normalized);
    if (rank >= 99) continue;
    const key = entry.courseNumber.trim();
    if (!key) continue;
    const existing = counts.get(key);
    if (!existing) {
      counts.set(key, { title: entry.title, optionCount: 1, bestRank: rank });
    } else {
      existing.optionCount += 1;
      existing.bestRank = Math.min(existing.bestRank, rank);
    }
  }

  return Array.from(counts.entries())
    .map(([courseNumber, meta]) => ({
      courseNumber,
      optionCount: meta.optionCount,
      rank: meta.bestRank,
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.optionCount - a.optionCount ||
        a.courseNumber.localeCompare(b.courseNumber),
    )
    .slice(0, limit)
    .map(({ courseNumber, optionCount }) => ({ courseNumber, optionCount }));
}
