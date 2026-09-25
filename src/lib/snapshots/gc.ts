import {
  SNAPSHOT_RETENTION_PRIOR_VERSIONS,
  type SnapshotDomain,
  type SnapshotManifest,
} from "./types";
import { SNAPSHOT_ROOT_PREFIX } from "./paths";
import { getSnapshotStore } from "./store";
import { readCurrentManifest, readPreviousManifest, versionForDomain } from "./manifest";
import { assertSnapshotPublishEnabled } from "./publishGuard";

const DOMAINS: SnapshotDomain[] = ["programs", "courses", "transfers", "search"];

function versionFromPath(domain: SnapshotDomain, pathname: string): string | null {
  const prefix = `${SNAPSHOT_ROOT_PREFIX}/${domain}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const version = rest.split("/")[0];
  return version || null;
}

async function listDomainVersions(domain: SnapshotDomain): Promise<string[]> {
  const store = await getSnapshotStore();
  const prefix = `${SNAPSHOT_ROOT_PREFIX}/${domain}/`;
  const paths = await store.list(prefix);
  const versions = new Set<string>();
  for (const pathname of paths) {
    const version = versionFromPath(domain, pathname);
    if (version) versions.add(version);
  }
  // Version ids embed an ISO timestamp (`domain-2025-09-25T12-00-00-000Z`), so
  // lexicographic descending order is newest-first.
  return [...versions].sort((a, b) => b.localeCompare(a));
}

function protectedVersions(
  domain: SnapshotDomain,
  current: SnapshotManifest | null,
  previous: SnapshotManifest | null,
): Set<string> {
  const keep = new Set<string>();
  const cur = versionForDomain(current, domain);
  const prev = versionForDomain(previous, domain);
  if (cur) keep.add(cur);
  if (prev) keep.add(prev);
  return keep;
}

/**
 * Retain current + SNAPSHOT_RETENTION_PRIOR_VERSIONS prior version dirs per domain.
 * Never delete versions referenced by the current OR previous manifest.
 */
export async function gcSnapshotVersions(options?: {
  retentionPriorVersions?: number;
  domains?: SnapshotDomain[];
}): Promise<{ deleted: string[]; retained: string[] }> {
  assertSnapshotPublishEnabled("garbage-collect snapshot versions");
  const retention = options?.retentionPriorVersions ?? SNAPSHOT_RETENTION_PRIOR_VERSIONS;
  const domains = options?.domains ?? DOMAINS;
  const store = await getSnapshotStore();
  const [current, previous] = await Promise.all([
    readCurrentManifest(),
    readPreviousManifest(),
  ]);

  const deleted: string[] = [];
  const retained: string[] = [];

  for (const domain of domains) {
    const versions = await listDomainVersions(domain);
    const protectedSet = protectedVersions(domain, current, previous);
    const keep = new Set(versions.slice(0, retention + 1));
    for (const version of protectedSet) keep.add(version);

    for (const version of versions) {
      if (keep.has(version)) {
        retained.push(`${domain}/${version}`);
        continue;
      }

      const prefix = `${SNAPSHOT_ROOT_PREFIX}/${domain}/${version}/`;
      const paths = await store.list(prefix);
      for (const pathname of paths) {
        await store.remove(pathname);
      }
      deleted.push(`${domain}/${version}`);
    }
  }

  return { deleted, retained };
}
