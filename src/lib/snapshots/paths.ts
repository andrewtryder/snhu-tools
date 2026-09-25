import path from "node:path";
import type { SnapshotDomain } from "./types";

export const SNAPSHOT_ROOT_PREFIX = "snhu-tools/snapshots/v1";

export function manifestCurrentPath(): string {
  return `${SNAPSHOT_ROOT_PREFIX}/manifests/current.json`;
}

export function manifestPreviousPath(): string {
  return `${SNAPSHOT_ROOT_PREFIX}/manifests/previous.json`;
}

export function domainBundlePath(domain: SnapshotDomain, version: string): string {
  return `${SNAPSHOT_ROOT_PREFIX}/${domain}/${version}/bundle.json`;
}

export function domainMetaPath(domain: SnapshotDomain, version: string): string {
  return `${SNAPSHOT_ROOT_PREFIX}/${domain}/${version}/meta.json`;
}

export function localSnapshotRoot(): string {
  return (
    process.env.SNAPSHOT_STORE_DIR ||
    path.join(process.cwd(), ".data", "snapshots")
  );
}

export function createSnapshotVersion(domain: SnapshotDomain): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${domain}-${stamp}`;
}
