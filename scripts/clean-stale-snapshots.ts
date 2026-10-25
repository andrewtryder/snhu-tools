import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

export function cleanStaleSnapshots(activeDir: string = "src/data/snapshots"): number {
  const rootDir = process.cwd();
  const dataDir = path.dirname(path.resolve(rootDir, activeDir));
  let removedCount = 0;

  if (existsSync(dataDir)) {
    const entries = readdirSync(dataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name.startsWith(".snapshot-stage-") ||
        entry.name.startsWith(".snapshots.previous-") ||
        entry.name.startsWith(".snapshot-backup-temp-") ||
        entry.name.startsWith(".snapshots.active-temp-")
      ) {
        rmSync(path.join(dataDir, entry.name), { recursive: true, force: true });
        removedCount++;
      }
    }
  }

  const rootArtifacts = [
    ".snapshot-pr-summary.md",
    ".snapshot-promotion.json",
  ];

  for (const artifact of rootArtifacts) {
    const p = path.resolve(rootDir, artifact);
    if (existsSync(p)) {
      rmSync(p, { force: true });
      removedCount++;
    }
  }

  return removedCount;
}

if (process.argv[1]?.endsWith("clean-stale-snapshots.ts")) {
  const count = cleanStaleSnapshots();
  console.log(`[snapshot-clean] Removed ${count} stale snapshot artifact(s).`);
}
