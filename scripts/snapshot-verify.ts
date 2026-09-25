import dotenv from "dotenv";
import {
  readCurrentManifest,
  readDomainBundle,
  versionForDomain,
  type SnapshotDomain,
  type ProgramsSnapshotBundle,
  type CoursesSnapshotBundle,
  type TransfersSnapshotBundle,
  type SearchIndexSnapshot,
  validateProgramsBundle,
  validateCoursesBundle,
  validateTransfersBundle,
  validateSearchBundle,
  assertSearchBuiltFromMatchesManifest,
} from "@/lib/snapshots";

dotenv.config();

export async function main(): Promise<void> {
  if (!process.env.SNAPSHOT_STORE && !process.env.BLOB_READ_WRITE_TOKEN) {
    process.env.SNAPSHOT_STORE = "fs";
  }

  const manifest = await readCurrentManifest();
  if (!manifest) {
    throw new Error("No current snapshot manifest found");
  }

  const checks: Array<{ domain: SnapshotDomain; version: string | null; count: number }> = [];

  const programsVersion = versionForDomain(manifest, "programs");
  if (programsVersion) {
    const bundle = await readDomainBundle<ProgramsSnapshotBundle>("programs", programsVersion);
    if (!bundle) throw new Error(`Missing programs bundle for ${programsVersion}`);
    validateProgramsBundle(bundle);
    checks.push({ domain: "programs", version: programsVersion, count: bundle.directory.length });
  }

  const coursesVersion = versionForDomain(manifest, "courses");
  if (coursesVersion) {
    const bundle = await readDomainBundle<CoursesSnapshotBundle>("courses", coursesVersion);
    if (!bundle) throw new Error(`Missing courses bundle for ${coursesVersion}`);
    validateCoursesBundle(bundle);
    checks.push({ domain: "courses", version: coursesVersion, count: bundle.summaries.length });
  }

  const transfersVersion = versionForDomain(manifest, "transfers");
  if (transfersVersion) {
    const bundle = await readDomainBundle<TransfersSnapshotBundle>("transfers", transfersVersion);
    if (!bundle) throw new Error(`Missing transfers bundle for ${transfersVersion}`);
    validateTransfersBundle(bundle);
    checks.push({ domain: "transfers", version: transfersVersion, count: bundle.rows.length });
  }

  const searchVersion = versionForDomain(manifest, "search");
  if (searchVersion) {
    const bundle = await readDomainBundle<SearchIndexSnapshot>("search", searchVersion);
    if (!bundle) throw new Error(`Missing search bundle for ${searchVersion}`);
    validateSearchBundle(bundle);
    assertSearchBuiltFromMatchesManifest(bundle, manifest);
    const count =
      bundle.programs.length + bundle.courses.length + bundle.transfers.length;
    checks.push({ domain: "search", version: searchVersion, count });
  }

  if (checks.length === 0) {
    throw new Error("Manifest exists but no domain versions are set");
  }

  for (const check of checks) {
    if (check.count <= 0) {
      throw new Error(`${check.domain} snapshot count is zero`);
    }
  }

  console.log(
    JSON.stringify(
      {
        action: "ok",
        publishedAt: manifest.publishedAt,
        counts: manifest.counts,
        checks,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        action: "error",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
}
