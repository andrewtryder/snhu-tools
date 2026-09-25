import { createSnapshotVersion } from "../paths";
import {
  publishDomainSnapshot,
  readCurrentManifest,
  readDomainBundle,
  versionForDomain,
} from "../manifest";
import type { SnapshotMeta } from "../types";
import type { ProgramsSnapshotBundle } from "./programs";
import type { CoursesSnapshotBundle } from "./courses";
import type { TransfersSnapshotBundle } from "./transfers";
import { buildProgramsSnapshotFromDatabase } from "./programs";
import { buildCoursesSnapshotFromDatabase } from "./courses";
import { buildTransfersSnapshotFromDatabase } from "./transfers";

export interface SearchProgramEntry {
  slug: string;
  title: string;
  credential: string;
  degreeLevel: string;
}

export interface SearchCourseEntry {
  id: string;
  title: string;
}

export interface SearchTransferEntry {
  courseNumber: string;
  title: string;
  subjectPrefix: string;
}

export interface SearchBuiltFrom {
  programs: string | null;
  courses: string | null;
  transfers: string | null;
}

export interface SearchIndexSnapshot {
  meta: SnapshotMeta;
  /** Domain snapshot versions this index was built from (cross-domain consistency). */
  builtFrom: SearchBuiltFrom;
  programs: SearchProgramEntry[];
  courses: SearchCourseEntry[];
  transfers: SearchTransferEntry[];
}

export function buildSearchIndexFromBundles(args: {
  programs?: Pick<ProgramsSnapshotBundle, "directory" | "meta"> | null;
  courses?: Pick<CoursesSnapshotBundle, "summaries" | "meta"> | null;
  transfers?: Pick<TransfersSnapshotBundle, "rows" | "meta"> | null;
  builtFrom?: SearchBuiltFrom;
}): SearchIndexSnapshot {
  const programs: SearchProgramEntry[] = (args.programs?.directory ?? []).map((p) => ({
    slug: p.slug,
    title: p.title,
    credential: p.credential,
    degreeLevel: p.degreeLevel,
  }));

  const courses: SearchCourseEntry[] = (args.courses?.summaries ?? []).map((c) => ({
    id: c.catalog_course_id,
    title: c.title,
  }));

  const seenTransfers = new Set<string>();
  const transfers: SearchTransferEntry[] = [];
  for (const row of args.transfers?.rows ?? []) {
    const courseNumber = (row.courseNumber ?? "").trim();
    if (!courseNumber) continue;
    const subjectPrefix = (row.subjectPrefix ?? "").trim();
    const title = (row.title ?? "").trim();
    const key = `${subjectPrefix}\0${courseNumber}\0${title}`;
    if (seenTransfers.has(key)) continue;
    seenTransfers.add(key);
    transfers.push({ courseNumber, title, subjectPrefix });
  }

  const version = createSnapshotVersion("search");
  const publishedAt = new Date().toISOString();
  const sourceUpdatedAt = null;
  const builtFrom: SearchBuiltFrom = args.builtFrom ?? {
    programs: args.programs?.meta?.version ?? null,
    courses: args.courses?.meta?.version ?? null,
    transfers: args.transfers?.meta?.version ?? null,
  };

  return {
    meta: {
      domain: "search",
      version,
      publishedAt,
      sourceUpdatedAt,
      counts: {
        programs: programs.length,
        courses: courses.length,
        transfers: transfers.length,
        searchEntries: programs.length + courses.length + transfers.length,
      },
    },
    builtFrom,
    programs,
    courses,
    transfers,
  };
}

export async function buildSearchIndexFromDatabase(): Promise<SearchIndexSnapshot> {
  const [programs, courses, transfers] = await Promise.all([
    buildProgramsSnapshotFromDatabase(),
    buildCoursesSnapshotFromDatabase(),
    buildTransfersSnapshotFromDatabase(),
  ]);
  return buildSearchIndexFromBundles({ programs, courses, transfers });
}

export async function buildSearchIndexFromPublishedDomains(): Promise<SearchIndexSnapshot> {
  const manifest = await readCurrentManifest();
  const programsVersion = versionForDomain(manifest, "programs");
  const coursesVersion = versionForDomain(manifest, "courses");
  const transfersVersion = versionForDomain(manifest, "transfers");
  const [programs, courses, transfers] = await Promise.all([
    readDomainBundle<ProgramsSnapshotBundle>("programs", programsVersion),
    readDomainBundle<CoursesSnapshotBundle>("courses", coursesVersion),
    readDomainBundle<TransfersSnapshotBundle>("transfers", transfersVersion),
  ]);

  const index = buildSearchIndexFromBundles({
    programs,
    courses,
    transfers,
    builtFrom: {
      programs: programsVersion,
      courses: coursesVersion,
      transfers: transfersVersion,
    },
  });
  if (
    index.programs.length === 0 &&
    index.courses.length === 0 &&
    index.transfers.length === 0
  ) {
    // Fall back to live DB when no domain snapshots exist yet.
    return buildSearchIndexFromDatabase();
  }
  return index;
}

export function validateSearchBundle(bundle: SearchIndexSnapshot): void {
  if (!bundle?.meta || bundle.meta.domain !== "search") {
    throw new Error("Invalid search snapshot: missing meta");
  }
  if (!bundle.builtFrom || typeof bundle.builtFrom !== "object") {
    throw new Error("Invalid search snapshot: missing builtFrom domain versions");
  }
  const total =
    (bundle.programs?.length ?? 0) +
    (bundle.courses?.length ?? 0) +
    (bundle.transfers?.length ?? 0);
  if (total === 0) {
    throw new Error("Invalid search snapshot: at least one domain must have entries");
  }
}

/** Fail when search was built from domain versions that no longer match the current manifest. */
export function assertSearchBuiltFromMatchesManifest(
  bundle: SearchIndexSnapshot,
  manifest: {
    programsVersion: string | null;
    coursesVersion: string | null;
    transfersVersion: string | null;
  },
): void {
  const expected: SearchBuiltFrom = {
    programs: manifest.programsVersion,
    courses: manifest.coursesVersion,
    transfers: manifest.transfersVersion,
  };
  for (const domain of ["programs", "courses", "transfers"] as const) {
    const from = bundle.builtFrom?.[domain] ?? null;
    const current = expected[domain];
    if (current && from && from !== current) {
      throw new Error(
        `Search snapshot builtFrom.${domain}=${from} does not match manifest ${domain}Version=${current}`,
      );
    }
  }
}

export async function publishSearchSnapshot(options?: {
  /** Prefer already-published domain bundles when available. */
  fromPublishedDomains?: boolean;
  programs?: ProgramsSnapshotBundle | null;
  courses?: CoursesSnapshotBundle | null;
  transfers?: TransfersSnapshotBundle | null;
}): Promise<{
  version: string;
  counts: { programs: number; courses: number; transfers: number; searchEntries: number };
}> {
  let bundle: SearchIndexSnapshot;

  if (options?.programs || options?.courses || options?.transfers) {
    bundle = buildSearchIndexFromBundles({
      programs: options.programs,
      courses: options.courses,
      transfers: options.transfers,
    });
  } else if (options?.fromPublishedDomains !== false) {
    bundle = await buildSearchIndexFromPublishedDomains();
  } else {
    bundle = await buildSearchIndexFromDatabase();
  }

  const searchEntries =
    bundle.programs.length + bundle.courses.length + bundle.transfers.length;

  const { version } = await publishDomainSnapshot({
    domain: "search",
    bundle,
    validate: validateSearchBundle,
    counts: { searchEntries },
  });

  return {
    version,
    counts: {
      programs: bundle.programs.length,
      courses: bundle.courses.length,
      transfers: bundle.transfers.length,
      searchEntries,
    },
  };
}
