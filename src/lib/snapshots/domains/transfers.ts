import {
  loadTransferSnapshotSource,
  type CourseDirectoryEntry,
  type DirectoryEntry,
  type TransferRow,
} from "@/features/transfers/lib/seoQueries";
import { createSnapshotVersion } from "../paths";
import { publishDomainSnapshot } from "../manifest";
import type { SnapshotMeta } from "../types";

export interface TransfersSnapshotBundle {
  meta: SnapshotMeta;
  rows: TransferRow[];
  subjects: string[];
  organizations: string[];
  levels: string[];
  courseNumbers: string[];
  subjectDirectory: DirectoryEntry[];
  organizationDirectory: DirectoryEntry[];
  levelDirectory: DirectoryEntry[];
  courseDirectory: CourseDirectoryEntry[];
  lastUpdated: string | null;
}

function assertDbConfigured(): void {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is required to build transfer snapshots");
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function buildTransfersSnapshotFromDatabase(): Promise<TransfersSnapshotBundle> {
  assertDbConfigured();
  const source = await loadTransferSnapshotSource();

  if (source.rows.length === 0) {
    throw new Error("Refusing to build transfers snapshot: rows are empty");
  }

  const lastUpdated = toIso(source.lastUpdated);
  const version = createSnapshotVersion("transfers");
  const publishedAt = new Date().toISOString();

  return {
    meta: {
      domain: "transfers",
      version,
      publishedAt,
      sourceUpdatedAt: lastUpdated,
      counts: {
        rows: source.rows.length,
        subjects: source.subjects.length,
        organizations: source.organizations.length,
        levels: source.levels.length,
        courseNumbers: source.courseNumbers.length,
      },
    },
    rows: source.rows,
    subjects: source.subjects,
    organizations: source.organizations,
    levels: source.levels,
    courseNumbers: source.courseNumbers,
    subjectDirectory: source.subjectDirectory,
    organizationDirectory: source.organizationDirectory,
    levelDirectory: source.levelDirectory,
    courseDirectory: source.courseDirectory,
    lastUpdated,
  };
}

export function validateTransfersBundle(bundle: TransfersSnapshotBundle): void {
  if (!bundle?.meta || bundle.meta.domain !== "transfers") {
    throw new Error("Invalid transfers snapshot: missing meta");
  }
  if (!Array.isArray(bundle.rows) || bundle.rows.length === 0) {
    throw new Error("Invalid transfers snapshot: rows must be non-empty");
  }
}

export async function publishTransfersSnapshot(): Promise<{
  version: string;
  counts: { rows: number };
}> {
  const bundle = await buildTransfersSnapshotFromDatabase();
  const { version } = await publishDomainSnapshot({
    domain: "transfers",
    bundle,
    validate: validateTransfersBundle,
    sourceUpdatedAt: bundle.lastUpdated,
    counts: { transfers: bundle.rows.length },
  });
  return {
    version,
    counts: { rows: bundle.rows.length },
  };
}
