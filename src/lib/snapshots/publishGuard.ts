/**
 * Snapshot publication / manifest mutation is opt-in.
 * Runtime (Vercel Production/Preview/Development) may read snapshots but must
 * not publish or flip manifests. Only trusted writer jobs / bootstrap set:
 *   SNAPSHOT_PUBLISH_ENABLED=true
 */
export function isSnapshotPublishEnabled(): boolean {
  return process.env.SNAPSHOT_PUBLISH_ENABLED === "true";
}

export function assertSnapshotPublishEnabled(action = "publish snapshots"): void {
  if (isSnapshotPublishEnabled()) return;
  throw new Error(
    `Refusing to ${action}: set SNAPSHOT_PUBLISH_ENABLED=true only in trusted writer/bootstrap environments (never in Preview/Development app deploys).`,
  );
}
