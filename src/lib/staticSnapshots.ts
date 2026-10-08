import "server-only";
import { createHash } from "node:crypto";
import manifest from "@/data/snapshots/manifest.json";
import programs from "@/data/snapshots/programs.json";
import courses from "@/data/snapshots/courses.json";
import transfers from "@/data/snapshots/transfers.json";
import search from "@/data/snapshots/search.json";

export const STATIC_SNAPSHOT_SCHEMA_VERSION = 1;
export type StaticSnapshotDomain = "programs" | "courses" | "transfers" | "search";

type DomainBundle = { meta: { domain: StaticSnapshotDomain; counts: Record<string, number> } };
type Manifest = {
  schemaVersion: number;
  createdAt: string;
  fixture: boolean;
  domains: Record<StaticSnapshotDomain, { file: string; sha256: string; required: boolean; counts: Record<string, number> }>;
};

const bundles: Record<StaticSnapshotDomain, DomainBundle> = { programs: programs as DomainBundle, courses: courses as DomainBundle, transfers: transfers as DomainBundle, search: search as DomainBundle };
let validated = false;

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Validate every required bundle before any public read. There is intentionally no DB fallback. */
export function assertStaticSnapshots(): void {
  if (validated) return;
  const typedManifest = manifest as Manifest;
  const fixtureAllowed = process.env.ALLOW_FIXTURE_SNAPSHOTS === "true";
  if (typedManifest.fixture && (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "preview") && !fixtureAllowed) {
    throw new Error("Fixture static snapshots are forbidden in production or preview without ALLOW_FIXTURE_SNAPSHOTS=true");
  }
  if (typedManifest.schemaVersion !== STATIC_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`Unsupported static snapshot schema ${typedManifest.schemaVersion}`);
  }
  for (const domain of ["programs", "courses", "transfers", "search"] as const) {
    const entry = typedManifest.domains?.[domain];
    const bundle = bundles[domain];
    if (!entry?.required || !bundle || bundle.meta?.domain !== domain) {
      throw new Error(`Static snapshot ${domain} is missing or invalid`);
    }
    if (digest(bundle) !== entry.sha256) {
      throw new Error(`Static snapshot ${domain} checksum mismatch`);
    }
    for (const [key, expected] of Object.entries(entry.counts)) {
      if (bundle.meta.counts[key] !== expected || expected <= 0) {
        throw new Error(`Static snapshot ${domain} has incomplete ${key} count`);
      }
    }
  }
  const programData = programs as { directory: Array<{ slug: string }>; bySlug: Record<string, unknown> };
  const courseData = courses as { ids: string[]; records: Record<string, unknown> };
  const transferData = transfers as { rows: Array<{ courseNumber?: string | null }> };
  const searchData = search as { programs: unknown[]; courses: unknown[]; transfers: unknown[] };
  if (programData.directory.some((program) => !program.slug || !programData.bySlug[program.slug])) throw new Error("Static program snapshot has orphaned directory records");
  if (courseData.ids.some((id) => !id || !courseData.records[id])) throw new Error("Static course snapshot has orphaned identifiers");
  if (transferData.rows.some((row) => !row.courseNumber?.trim())) throw new Error("Static transfer snapshot has invalid course identifiers");
  if (searchData.programs.length + searchData.courses.length + searchData.transfers.length !== bundles.search.meta.counts.entries) throw new Error("Static search snapshot is incomplete");
  validated = true;
}

/** Test-only hook for validating distinct deployment environments in one process. */
export function resetStaticSnapshotValidationForTests(): void {
  validated = false;
}

export function getStaticSnapshot<T extends DomainBundle>(domain: StaticSnapshotDomain): T {
  assertStaticSnapshots();
  return bundles[domain] as T;
}

export function getStaticSnapshotManifest(): Manifest {
  assertStaticSnapshots();
  return manifest as Manifest;
}
