import {
  EMPTY_MANIFEST,
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotDomain,
  type SnapshotManifest,
  type SnapshotMeta,
} from "./types";
import { getSnapshotStore } from "./store";
import {
  createSnapshotVersion,
  domainBundlePath,
  domainMetaPath,
  manifestCurrentPath,
  manifestPreviousPath,
} from "./paths";

export async function readCurrentManifest(): Promise<SnapshotManifest | null> {
  const store = await getSnapshotStore();
  const manifest = await store.readJson<SnapshotManifest>(manifestCurrentPath());
  if (!manifest) return null;
  if (manifest.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    console.error("[snapshots] Unsupported manifest schemaVersion", {
      schemaVersion: manifest.schemaVersion,
    });
    return null;
  }
  return manifest;
}

export async function readPreviousManifest(): Promise<SnapshotManifest | null> {
  const store = await getSnapshotStore();
  return store.readJson<SnapshotManifest>(manifestPreviousPath());
}

export async function readDomainBundle<T>(
  domain: SnapshotDomain,
  version: string | null | undefined,
): Promise<T | null> {
  if (!version) return null;
  const store = await getSnapshotStore();
  return store.readJson<T>(domainBundlePath(domain, version));
}

export async function readDomainMeta(
  domain: SnapshotDomain,
  version: string | null | undefined,
): Promise<SnapshotMeta | null> {
  if (!version) return null;
  const store = await getSnapshotStore();
  return store.readJson<SnapshotMeta>(domainMetaPath(domain, version));
}

export function versionForDomain(
  manifest: SnapshotManifest | null,
  domain: SnapshotDomain,
): string | null {
  if (!manifest) return null;
  switch (domain) {
    case "programs":
      return manifest.programsVersion;
    case "courses":
      return manifest.coursesVersion;
    case "transfers":
      return manifest.transfersVersion;
    case "search":
      return manifest.searchVersion;
  }
}

/**
 * Publish a verified domain bundle under a new immutable version, then
 * atomically advance the current manifest. Failure before the manifest write
 * leaves the previous current pointer untouched.
 */
export async function publishDomainSnapshot<T extends { meta: SnapshotMeta }>(args: {
  domain: SnapshotDomain;
  bundle: T;
  validate: (bundle: T) => void;
  sourceUpdatedAt?: string | null;
  counts?: Partial<SnapshotManifest["counts"]>;
}): Promise<{ version: string; manifest: SnapshotManifest }> {
  const { domain, bundle, validate } = args;
  validate(bundle);

  const version = bundle.meta.version || createSnapshotVersion(domain);
  const store = await getSnapshotStore();

  // Immutable objects first — never overwrite an existing version path.
  await store.writeJson(domainBundlePath(domain, version), bundle, { overwrite: false });
  await store.writeJson(domainMetaPath(domain, version), bundle.meta, { overwrite: false });

  // Verify readability + structure before flipping the pointer.
  const stored = await store.readJson<T>(domainBundlePath(domain, version));
  if (!stored) {
    throw new Error(`Snapshot verify failed: could not read ${domain}/${version}`);
  }
  validate(stored);

  const previous = (await readCurrentManifest()) ?? EMPTY_MANIFEST();
  const next: SnapshotManifest = {
    ...previous,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    publishedAt: new Date().toISOString(),
    sourceUpdatedAt: {
      ...previous.sourceUpdatedAt,
      ...(domain === "search"
        ? {}
        : {
            [domain]: args.sourceUpdatedAt ?? bundle.meta.sourceUpdatedAt ?? previous.sourceUpdatedAt[domain as "programs" | "courses" | "transfers"],
          }),
    },
    counts: {
      ...previous.counts,
      ...args.counts,
    },
    programsVersion: domain === "programs" ? version : previous.programsVersion,
    coursesVersion: domain === "courses" ? version : previous.coursesVersion,
    transfersVersion: domain === "transfers" ? version : previous.transfersVersion,
    searchVersion: domain === "search" ? version : previous.searchVersion,
  };

  // Keep prior current as rollback target, then overwrite current.
  if (previous.programsVersion || previous.coursesVersion || previous.transfersVersion || previous.searchVersion) {
    await store.writeJson(manifestPreviousPath(), previous, { overwrite: true });
  }
  await store.writeJson(manifestCurrentPath(), next, { overwrite: true });

  return { version, manifest: next };
}

/** Repoint current manifest to the stored previous manifest (rollback). */
export async function rollbackToPreviousManifest(): Promise<SnapshotManifest> {
  const store = await getSnapshotStore();
  const previous = await readPreviousManifest();
  if (!previous) {
    throw new Error("No previous snapshot manifest available to roll back to");
  }
  const current = await readCurrentManifest();
  if (current) {
    await store.writeJson(manifestPreviousPath(), current, { overwrite: true });
  }
  await store.writeJson(manifestCurrentPath(), previous, { overwrite: true });
  return previous;
}
