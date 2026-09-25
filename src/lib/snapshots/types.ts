/** Snapshot schema and shared types for durable last-known-good reads. */

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type SnapshotDomain = "programs" | "courses" | "transfers" | "search";

export interface SnapshotManifest {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  publishedAt: string;
  programsVersion: string | null;
  coursesVersion: string | null;
  transfersVersion: string | null;
  searchVersion: string | null;
  sourceUpdatedAt: {
    programs: string | null;
    courses: string | null;
    transfers: string | null;
  };
  counts: {
    programs: number;
    courses: number;
    transfers: number;
    searchEntries: number;
  };
}

export interface SnapshotMeta {
  domain: SnapshotDomain;
  version: string;
  publishedAt: string;
  sourceUpdatedAt: string | null;
  counts: Record<string, number>;
}

export const EMPTY_MANIFEST = (): SnapshotManifest => ({
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  publishedAt: new Date(0).toISOString(),
  programsVersion: null,
  coursesVersion: null,
  transfersVersion: null,
  searchVersion: null,
  sourceUpdatedAt: {
    programs: null,
    courses: null,
    transfers: null,
  },
  counts: {
    programs: 0,
    courses: 0,
    transfers: 0,
    searchEntries: 0,
  },
});

/** How many prior immutable versions to retain beyond current (per domain). */
export const SNAPSHOT_RETENTION_PRIOR_VERSIONS = 3;
