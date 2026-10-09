import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { exportCoursesFromDatabase } from "../src/lib/static-export/courses";
import { exportProgramsFromDatabase } from "../src/lib/static-export/programs";
import { transformSearch } from "../src/lib/static-export/search";
import {
  loadBundles,
  loadManifest,
  promoteReviewedStage,
  recoverSnapshotPromotion,
  stageSnapshot,
  type SnapshotBundles,
  type SnapshotProvenance,
} from "../src/lib/static-export/snapshot";
import { exportTransfersFromDatabase } from "../src/lib/static-export/transfers";
import {
  checkQuiescence,
  computeInventoryDiff,
  computeSyncMarkerDigest,
  generatePrSummary,
  hasDomainDifferences,
  loadCanonicalInventory,
  validateAllGates,
  type GateValidationResult,
  type SyncMarkerState,
} from "../src/lib/static-export/workflow";

export interface AutomationArgs {
  dryRun: boolean;
  checkOnly: boolean;
  force: boolean;
  createPr: boolean;
  stageDir?: string;
  activeDir: string;
  canonicalInventoryPath: string;
  approvalReference?: string;
  allowProgramDeletions: boolean;
  maxShrinkagePercent: number;
}

export function parseAutomationArgs(argv: string[]): AutomationArgs {
  const valueAfter = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
  };

  const dryRun = argv.includes("--dry-run");
  const checkOnly = argv.includes("--check-only");
  const force = argv.includes("--force");
  const createPr = argv.includes("--create-pr");
  const stageDir = valueAfter("--stage-dir");
  const activeDir = path.resolve(valueAfter("--active-dir") ?? "src/data/snapshots");
  const canonicalInventoryPath = path.resolve(
    valueAfter("--canonical-inventory") ?? "src/data/canonical-program-inventory.json"
  );
  const approvalReference = valueAfter("--approval-reference");
  const allowProgramDeletions = argv.includes("--allow-program-deletions");
  const shrinkageText = valueAfter("--max-shrinkage-percent");
  const maxShrinkagePercent = shrinkageText !== undefined ? Number(shrinkageText) : 1.0;

  return {
    dryRun,
    checkOnly,
    force,
    createPr,
    stageDir: stageDir ? path.resolve(stageDir) : undefined,
    activeDir,
    canonicalInventoryPath,
    approvalReference,
    allowProgramDeletions,
    maxShrinkagePercent,
  };
}

export async function exportBundlesFromDatabase(
  poolOrUrl: Pool | string,
  approvalRef: string,
  options?: { now?: Date | string; maxRecencyDays?: number }
): Promise<{
  bundles: SnapshotBundles;
  provenance: SnapshotProvenance;
  markersBefore: SyncMarkerState;
  markersAfter: SyncMarkerState;
}> {
  const pool =
    typeof poolOrUrl === "string"
      ? new Pool({
          connectionString: poolOrUrl,
          max: 1,
          connectionTimeoutMillis: 10_000,
          idleTimeoutMillis: 5_000,
          statement_timeout: 60_000,
          application_name: "snhu-weekly-snapshot-update",
        })
      : poolOrUrl;
  const isCreatedPool = typeof poolOrUrl === "string";

  try {
    const quiescence = await checkQuiescence(pool, options);
    if (!quiescence.quiescent) {
      throw new Error(`Database is not quiescent for export: ${quiescence.reasons.join(", ")}`);
    }

    const programs = await exportProgramsFromDatabase(pool);
    const courses = await exportCoursesFromDatabase(pool);
    const transfers = await exportTransfersFromDatabase(pool);

    const postCheck = await checkQuiescence(pool, options);
    if (JSON.stringify(quiescence.markers) !== JSON.stringify(postCheck.markers)) {
      throw new Error("Cross-domain sync markers shifted during database export; aborting export");
    }

    const bundles: SnapshotBundles = {
      programs,
      courses,
      transfers,
      search: transformSearch(programs, courses, transfers),
    };

    const provenance: SnapshotProvenance = {
      kind: "postgres",
      source: "postgres-readonly-export",
      sourceDigest: computeSyncMarkerDigest(quiescence.markers),
      approvalReference: approvalRef,
      approved: true,
    };

    return {
      bundles,
      provenance,
      markersBefore: quiescence.markers,
      markersAfter: postCheck.markers,
    };
  } finally {
    if (isCreatedPool) {
      await pool.end();
    }
  }
}

export async function runAutomatedSnapshotUpdate(
  argv: string[],
  runnerOptions?: { pool?: Pool; now?: Date | string }
) {
  const args = parseAutomationArgs(argv);
  const now = runnerOptions?.now ? new Date(runnerOptions.now) : new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const approvalRef = args.approvalReference ?? `WEEKLY-${dateStr}`;

  console.log(`[snapshot-automation] Starting automated snapshot update runner (date: ${dateStr})`);

  // 1. Verify enabled state
  const isExplicitlyEnabled =
    process.env.ENABLE_WEEKLY_SNAPSHOT_WORKFLOW === "true" ||
    process.env.STATIC_EXPORT_APPROVED === "true" ||
    args.force ||
    args.dryRun;

  if (!isExplicitlyEnabled) {
    console.log(
      "[snapshot-automation] Automation is disabled by default (ENABLE_WEEKLY_SNAPSHOT_WORKFLOW is not 'true'). Exiting cleanly."
    );
    return { status: "disabled", changesDetected: false, prCreated: false };
  }

  // 2. Load active baseline
  const baselineManifest = await loadManifest(args.activeDir);
  const baselineBundles = baselineManifest ? await loadBundles(args.activeDir) : null;
  const canonicalInventory = await loadCanonicalInventory(args.canonicalInventoryPath);

  // 3. Obtain staged bundles
  let stagedBundles: SnapshotBundles;
  let stagedManifest: import("../src/lib/static-export/snapshot").SnapshotManifest;
  let stagedReport: import("../src/lib/static-export/snapshot").SnapshotReport;
  let stagedDirectory: string;
  let syncMarkers: { before: SyncMarkerState; after: SyncMarkerState } | null = null;

  if (args.stageDir) {
    console.log(`[snapshot-automation] Loading existing staged export from ${args.stageDir}`);
    stagedDirectory = args.stageDir;
    stagedBundles = await loadBundles(stagedDirectory);
    const m = await loadManifest(stagedDirectory);
    if (!m) throw new Error(`Missing manifest.json in provided stageDir: ${stagedDirectory}`);
    stagedManifest = m;
    const r = await readFile(path.join(stagedDirectory, "report.json"), "utf8");
    stagedReport = JSON.parse(r);
  } else {
    const postgresUrl = process.env.READONLY_POSTGRES_URL || process.env.POSTGRES_URL;
    const pool = runnerOptions?.pool ?? postgresUrl;
    if (!pool) {
      throw new Error(
        "[snapshot-automation] Missing READONLY_POSTGRES_URL (or POSTGRES_URL) for database export"
      );
    }

    console.log("[snapshot-automation] Exporting fresh snapshot from read-only PostgreSQL...");
    const dbExport = await exportBundlesFromDatabase(pool, approvalRef, { now });
    syncMarkers = {
      before: dbExport.markersBefore,
      after: dbExport.markersAfter,
    };

    console.log("[snapshot-automation] Staging fresh snapshot...");
    const staged = await stageSnapshot(dbExport.bundles, args.activeDir, {
      fixture: false,
      provenance: dbExport.provenance,
      baseline: baselineManifest,
      minimumRetention: 0.5,
    });

    stagedBundles = dbExport.bundles;
    stagedManifest = staged.manifest;
    stagedReport = staged.report;
    stagedDirectory = staged.directory;
  }

  // 4. Run all acceptance gates
  console.log("[snapshot-automation] Validating all acceptance gates on staged snapshot...");
  const gateResults: GateValidationResult = validateAllGates(stagedBundles, stagedManifest, stagedReport, {
    canonicalInventory,
    allowProgramDeletions: args.allowProgramDeletions,
    maxShrinkagePercent: args.maxShrinkagePercent,
    baselineManifest,
    baselineBundles,
    quiescenceEvidence: syncMarkers
      ? {
          markersBefore: syncMarkers.before,
          markersAfter: syncMarkers.after,
          now,
        }
      : undefined,
    requireQuiescenceEvidence: !args.stageDir,
  });

  if (!gateResults.passed) {
    console.error("[snapshot-automation] Acceptance gates FAILED with errors:");
    for (const err of gateResults.errors) console.error(`  - ${err}`);
    throw new Error(`Data integrity acceptance gates failed (${gateResults.errors.length} errors)`);
  }
  console.log("[snapshot-automation] All acceptance gates PASSED.");

  if (args.checkOnly) {
    console.log("[snapshot-automation] Check-only mode completed successfully.");
    return { status: "checked", changesDetected: false, prCreated: false, gateResults };
  }

  // 5. Compare against active baseline
  const changesDetected = hasDomainDifferences(stagedManifest, baselineManifest);
  const diff = computeInventoryDiff(stagedBundles, baselineBundles);

  if (!changesDetected && !diff.hasChanges) {
    console.log("[snapshot-automation] No catalog changes detected between upstream database and committed baseline.");
    console.log("[snapshot-automation] Exiting cleanly without opening or modifying a pull request.");
    return { status: "no_changes", changesDetected: false, prCreated: false };
  }

  console.log("[snapshot-automation] Catalog changes detected in upstream database:");
  console.log(`  Programs: ${diff.programs.baseline} -> ${diff.programs.staged} (${diff.programs.delta >= 0 ? `+${diff.programs.delta}` : diff.programs.delta})`);
  console.log(`  Courses: ${diff.courses.baseline} -> ${diff.courses.staged} (${diff.courses.delta >= 0 ? `+${diff.courses.delta}` : diff.courses.delta})`);
  console.log(`  Prerequisite Edges: ${diff.prerequisites.baseline} -> ${diff.prerequisites.staged} (${diff.prerequisites.delta >= 0 ? `+${diff.prerequisites.delta}` : diff.prerequisites.delta})`);
  console.log(`  Transfers: ${diff.transfers.baseline} -> ${diff.transfers.staged} (${diff.transfers.delta >= 0 ? `+${diff.transfers.delta}` : diff.transfers.delta})`);
  console.log(`  Search Entries: ${diff.search.baseline} -> ${diff.search.staged} (${diff.search.delta >= 0 ? `+${diff.search.delta}` : diff.search.delta})`);

  // 6. Generate PR summary markdown
  const prSummary = generatePrSummary({
    stagedManifest,
    baselineManifest,
    diff,
    gateResults,
    syncMarkers: syncMarkers?.before,
    dateStr,
  });

  const summaryPath = path.resolve(".snapshot-pr-summary.md");
  await writeFile(summaryPath, prSummary, "utf8");
  console.log(`[snapshot-automation] PR summary saved to ${summaryPath}`);

  if (args.dryRun) {
    console.log("[snapshot-automation] Dry run requested: skipping stage promotion and PR operations.");
    return { status: "dry_run_completed", changesDetected: true, prCreated: false, prSummary };
  }

  // 7. Promote staged snapshot to active directory
  await recoverSnapshotPromotion(args.activeDir);
  console.log(`[snapshot-automation] Promoting stage ${stagedDirectory} to active directory ${args.activeDir}...`);
  await promoteReviewedStage(stagedDirectory, args.activeDir, baselineManifest, false, 0.5);
  console.log("[snapshot-automation] Promotion complete.");

  // 8. Manage branch and PR if requested
  if (args.createPr) {
    console.log("[snapshot-automation] Preparing Git branch and pull request...");
    const branchName = "automation/snapshot-update";
    const commitMsg = `chore(snapshots): weekly automated catalog update [${dateStr}]`;

    try {
      execSync(`git checkout -B ${branchName}`, { stdio: "inherit" });
      execSync(`git add src/data/snapshots/ src/data/canonical-program-inventory.json`, { stdio: "inherit" });
      execSync(`git commit -m "${commitMsg}"`, { stdio: "inherit" });

      // Check for existing PR
      let existingPrNumber: string | null = null;
      try {
        const prListOut = execSync(
          `gh pr list --head "${branchName}" --base main --json number --jq '.[0].number'`,
          { encoding: "utf8" }
        ).trim();
        if (prListOut) existingPrNumber = prListOut;
      } catch {
        // gh CLI might not be authenticated or available in test environments
      }

      if (existingPrNumber) {
        console.log(`[snapshot-automation] Found existing open PR #${existingPrNumber}; updating branch and description...`);
        execSync(`git push --force-with-lease origin ${branchName}`, { stdio: "inherit" });
        execSync(`gh pr edit ${existingPrNumber} --title "${commitMsg}" --body-file "${summaryPath}"`, {
          stdio: "inherit",
        });
        console.log(`[snapshot-automation] Updated existing PR #${existingPrNumber}`);
      } else {
        console.log("[snapshot-automation] Pushing new automation branch to origin...");
        execSync(`git push -u origin ${branchName}`, { stdio: "inherit" });
        execSync(
          `gh pr create --base main --head ${branchName} --title "${commitMsg}" --body-file "${summaryPath}" --label "snapshots,automated-pr"`,
          { stdio: "inherit" }
        );
        console.log("[snapshot-automation] Successfully created snapshot-update PR");
      }

      return { status: "pr_created_or_updated", changesDetected: true, prCreated: true };
    } catch (err) {
      console.error("[snapshot-automation] Git/PR operation failed:", err);
      throw err;
    }
  }

  return { status: "promoted_locally", changesDetected: true, prCreated: false };
}

if (process.argv[1]?.endsWith("automated-snapshot-update.ts")) {
  runAutomatedSnapshotUpdate(process.argv.slice(2))
    .then((res) => {
      console.log("[snapshot-automation] Result:", JSON.stringify(res, null, 2));
    })
    .catch((err) => {
      console.error("[snapshot-automation] FATAL:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
