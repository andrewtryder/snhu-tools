import { describe, expect, it } from "vitest";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  CANONICAL_CBE_PIDS,
  DEFAULT_MAX_SHRINKAGE_PERCENT,
  checkQuiescence,
  computeInventoryDiff,
  generatePrSummary,
  hasDomainDifferences,
  loadCanonicalInventory,
  scanForSecrets,
  validateAllGates,
  validateCbePrograms,
  validateCanonicalIdentifiers,
  validateCanonicalProgramInventory,
  validateDomainChecksums,
  validateInventoryShrinkage,
  validateManifestAndProvenance,
  validateProgramStructures,
  validateReconciliation,
} from "../lib/static-export/workflow";
import {
  loadBundles,
  loadManifest,
  recoverSnapshotPromotion,
  type SnapshotBundles,
  type SnapshotManifest,
  type SnapshotReport,
} from "../lib/static-export/snapshot";
import { runAutomatedSnapshotUpdate } from "../../scripts/automated-snapshot-update";

describe("Weekly Snapshot Workflow Integrity Gates", () => {
  const activeDir = path.resolve("src/data/snapshots");

  async function getBaseFixtures() {
    const manifest = (await loadManifest(activeDir))!;
    const bundles = await loadBundles(activeDir);
    const report: SnapshotReport = {
      fixture: false,
      provenance: manifest.provenance!,
      baseline: "approved",
      counts: {
        programs: bundles.programs.directory.length,
        courses: bundles.courses.ids.length,
        transfers: bundles.transfers.rows.length,
        search: bundles.search.meta.counts.entries,
      },
      rawBytes: {
        programs: 1000,
        courses: 1000,
        transfers: 1000,
        search: 1000,
      },
      reconciliation: { courses: bundles.courses.reconciliation! },
      sourceCoverage: bundles.courses.reconciliation?.sourceCoverage
        ? { courses: bundles.courses.reconciliation.sourceCoverage }
        : undefined,
      warnings: [],
    };
    const canonicalInventory = await loadCanonicalInventory();
    return { manifest, bundles, report, canonicalInventory };
  }

  it("passes all acceptance gates on the committed approved production snapshot", async () => {
    const { manifest, bundles, report, canonicalInventory } = await getBaseFixtures();
    const result = validateAllGates(bundles, manifest, report, {
      canonicalInventory,
      baselineBundles: bundles,
      baselineManifest: manifest,
    });

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.gates.manifestSchema.passed).toBe(true);
    expect(result.gates.checksums.passed).toBe(true);
    expect(result.gates.reconciliation.passed).toBe(true);
    expect(result.gates.canonicalIdentifiers.passed).toBe(true);
    expect(result.gates.canonicalProgramInventory.passed).toBe(true);
    expect(result.gates.programStructures.passed).toBe(true);
    expect(result.gates.cbePrograms.passed).toBe(true);
    expect(result.gates.inventoryShrinkage.passed).toBe(true);
    expect(result.gates.secretScanning.passed).toBe(true);
  });

  describe("Gate: Manifest Schema & Provenance", () => {
    it("fails if manifest is marked as fixture", async () => {
      const { manifest } = await getBaseFixtures();
      const tampered: SnapshotManifest = { ...manifest, fixture: true };
      const errors = validateManifestAndProvenance(tampered);
      expect(errors.some((e) => e.includes("marked as fixture"))).toBe(true);
    });

    it("fails if manifest schemaVersion is not 1", async () => {
      const { manifest } = await getBaseFixtures();
      const tampered = { ...manifest, schemaVersion: 2 as unknown as 1 };
      const errors = validateManifestAndProvenance(tampered);
      expect(errors.some((e) => e.includes("schemaVersion"))).toBe(true);
    });

    it("fails if provenance is not postgres or unapproved", async () => {
      const { manifest } = await getBaseFixtures();
      const tampered: SnapshotManifest = {
        ...manifest,
        provenance: {
          ...manifest.provenance!,
          kind: "json-import",
          approved: false,
        },
      };
      const errors = validateManifestAndProvenance(tampered);
      expect(errors.some((e) => e.includes("kind must be 'postgres'"))).toBe(true);
      expect(errors.some((e) => e.includes("not marked as approved"))).toBe(true);
    });

    it("fails if domain entries are missing or malformed", async () => {
      const { manifest } = await getBaseFixtures();
      const tampered: SnapshotManifest = {
        ...manifest,
        domains: {
          ...manifest.domains,
          programs: { ...manifest.domains.programs, sha256: "invalid-hash" },
        },
      };
      const errors = validateManifestAndProvenance(tampered);
      expect(errors.some((e) => e.includes("sha256 is invalid"))).toBe(true);
    });
  });

  describe("Gate: Domain Checksums", () => {
    it("fails if any domain checksum does not match bundle content", async () => {
      const { manifest, bundles } = await getBaseFixtures();
      const tamperedBundles: SnapshotBundles = {
        ...bundles,
        courses: {
          ...bundles.courses,
          ids: [...bundles.courses.ids, "NEW_FAKE_COURSE"],
        },
      };
      const errors = validateDomainChecksums(tamperedBundles, manifest);
      expect(errors.some((e) => e.includes("checksum mismatch for courses"))).toBe(true);
    });
  });

  describe("Gate: Reconciliation Accounting", () => {
    it("fails if course records reconciliation has rejected rows", async () => {
      const { bundles } = await getBaseFixtures();
      const tampered: SnapshotBundles = {
        ...bundles,
        courses: {
          ...bundles.courses,
          reconciliation: {
            ...bundles.courses.reconciliation!,
            records: {
              ...bundles.courses.reconciliation!.records,
              rejectedRows: 1,
            },
          },
        },
      };
      const errors = validateReconciliation(tampered);
      expect(errors.some((e) => e.includes("rejected rows (must be 0)"))).toBe(true);
    });

    it("fails if prerequisite edges reconciliation has rejected rows or duplicates", async () => {
      const { bundles } = await getBaseFixtures();
      const tampered: SnapshotBundles = {
        ...bundles,
        courses: {
          ...bundles.courses,
          reconciliation: {
            ...bundles.courses.reconciliation!,
            prerequisiteEdges: {
              ...bundles.courses.reconciliation!.prerequisiteEdges,
              duplicateRows: 3,
            },
          },
        },
      };
      const errors = validateReconciliation(tampered);
      expect(errors.some((e) => e.includes("duplicate rows (must be 0)"))).toBe(true);
    });

    it("fails if search entry counts do not balance with domains", async () => {
      const { bundles } = await getBaseFixtures();
      const tampered: SnapshotBundles = {
        ...bundles,
        search: {
          ...bundles.search,
          meta: {
            ...bundles.search.meta,
            counts: { entries: bundles.search.meta.counts.entries + 5 },
          },
        },
      };
      const errors = validateReconciliation(tampered);
      expect(errors.some((e) => e.includes("does not equal sum of domains"))).toBe(true);
    });
  });

  describe("Gate: Canonical Identifiers", () => {
    it("fails if duplicate program slugs exist", async () => {
      const { bundles } = await getBaseFixtures();
      const tampered: SnapshotBundles = {
        ...bundles,
        programs: {
          ...bundles.programs,
          directory: [...bundles.programs.directory, bundles.programs.directory[0]],
        },
      };
      const errors = validateCanonicalIdentifiers(tampered);
      expect(errors.some((e) => e.includes("Duplicate program slugs"))).toBe(true);
    });

    it("fails if duplicate course IDs exist", async () => {
      const { bundles } = await getBaseFixtures();
      const tampered: SnapshotBundles = {
        ...bundles,
        courses: {
          ...bundles.courses,
          ids: [...bundles.courses.ids, bundles.courses.ids[0]],
        },
      };
      const errors = validateCanonicalIdentifiers(tampered);
      expect(errors.some((e) => e.includes("Duplicate course IDs"))).toBe(true);
    });
  });

  describe("Gate: Canonical Program Inventory", () => {
    it("fails if a canonical program slug is missing without approval", async () => {
      const { bundles, canonicalInventory } = await getBaseFixtures();
      const removedSlug = canonicalInventory[0].slug;
      const tamperedDirectory = bundles.programs.directory.filter((p) => p.slug !== removedSlug);
      const tamperedPrograms = {
        ...bundles.programs,
        directory: tamperedDirectory,
      };

      const errors = validateCanonicalProgramInventory(tamperedPrograms, canonicalInventory, false);
      expect(errors.some((e) => e.includes(`Missing 1 canonical program slugs`))).toBe(true);
      expect(errors.some((e) => e.includes(removedSlug))).toBe(true);
    });

    it("allows program deletions only when explicitly permitted", async () => {
      const { bundles, canonicalInventory } = await getBaseFixtures();
      const removedSlug = canonicalInventory[0].slug;
      const tamperedDirectory = bundles.programs.directory.filter((p) => p.slug !== removedSlug);
      const tamperedPrograms = {
        ...bundles.programs,
        directory: tamperedDirectory,
      };

      const errors = validateCanonicalProgramInventory(tamperedPrograms, canonicalInventory, true);
      expect(errors).toHaveLength(0);
    });

    it("fails if a canonical program source PID has changed unexpectedly", async () => {
      const { bundles, canonicalInventory } = await getBaseFixtures();
      const targetSlug = canonicalInventory[0].slug;
      const tamperedBySlug = {
        ...bundles.programs.bySlug,
        [targetSlug]: {
          ...bundles.programs.bySlug[targetSlug],
          sourcePid: "CHANGED_PID",
        },
      };
      const tamperedPrograms = {
        ...bundles.programs,
        bySlug: tamperedBySlug,
      };

      const errors = validateCanonicalProgramInventory(tamperedPrograms, canonicalInventory, false);
      expect(errors.some((e) => e.includes(`PID mismatch`))).toBe(true);
    });
  });

  describe("Gate: Program Structures", () => {
    it("fails if any program has 0 requirement groups", async () => {
      const { bundles } = await getBaseFixtures();
      const targetSlug = bundles.programs.directory[0].slug;
      const tamperedBySlug = {
        ...bundles.programs.bySlug,
        [targetSlug]: {
          ...bundles.programs.bySlug[targetSlug],
          groups: [],
        },
      };
      const tamperedPrograms = {
        ...bundles.programs,
        bySlug: tamperedBySlug,
      };

      const errors = validateProgramStructures(tamperedPrograms);
      expect(errors.some((e) => e.includes("0 requirement groups"))).toBe(true);
    });
  });

  describe("Gate: Direct Assessment CBE Programs", () => {
    it("verifies all seven CBE programs with exact metrics (528 cr, 16 groups, 312 competencies, 7 text milestones)", async () => {
      const { bundles } = await getBaseFixtures();
      const errors = validateCbePrograms(bundles.programs);
      expect(errors).toHaveLength(0);
    });

    it("fails if any of the 7 CBE programs is missing", async () => {
      const { bundles } = await getBaseFixtures();
      const missingPid = CANONICAL_CBE_PIDS[0];
      const targetSlug = Object.values(bundles.programs.bySlug).find(
        (p) => p.sourcePid === missingPid
      )!.slug;

      const tamperedBySlug = { ...bundles.programs.bySlug };
      delete tamperedBySlug[targetSlug];
      const tamperedPrograms = {
        ...bundles.programs,
        directory: bundles.programs.directory.filter((p) => p.slug !== targetSlug),
        bySlug: tamperedBySlug,
      };

      const errors = validateCbePrograms(tamperedPrograms);
      expect(errors.some((e) => e.includes(`Missing expected CBE program with PID: ${missingPid}`))).toBe(true);
    });

    it("fails if CBE credit total deviates from 528", async () => {
      const { bundles } = await getBaseFixtures();
      const targetSlug = Object.values(bundles.programs.bySlug).find(
        (p) => p.sourcePid === CANONICAL_CBE_PIDS[0]
      )!.slug;

      const tamperedBySlug = {
        ...bundles.programs.bySlug,
        [targetSlug]: {
          ...bundles.programs.bySlug[targetSlug],
          totalCredits: 999,
        },
      };
      const tamperedPrograms = {
        ...bundles.programs,
        bySlug: tamperedBySlug,
      };

      const errors = validateCbePrograms(tamperedPrograms);
      expect(errors.some((e) => e.includes("CBE total credits mismatch"))).toBe(true);
    });
  });

  describe("Gate: Inventory Shrinkage Protection", () => {
    it("fails if courses inventory drops by more than strict threshold (1%)", async () => {
      const { bundles } = await getBaseFixtures();
      const shrunkCount = Math.floor(bundles.courses.ids.length * 0.95); // 5% drop
      const tamperedBundles: SnapshotBundles = {
        ...bundles,
        courses: {
          ...bundles.courses,
          ids: bundles.courses.ids.slice(0, shrunkCount),
        },
      };

      const errors = validateInventoryShrinkage(tamperedBundles, bundles, {
        maxShrinkagePercent: DEFAULT_MAX_SHRINKAGE_PERCENT,
        allowShrinkage: false,
      });

      expect(errors.some((e) => e.includes("Courses inventory shrank by"))).toBe(true);
    });

    it("allows shrinkage when explicitly approved", async () => {
      const { bundles } = await getBaseFixtures();
      const shrunkCount = Math.floor(bundles.courses.ids.length * 0.95);
      const tamperedBundles: SnapshotBundles = {
        ...bundles,
        courses: {
          ...bundles.courses,
          ids: bundles.courses.ids.slice(0, shrunkCount),
        },
      };

      const errors = validateInventoryShrinkage(tamperedBundles, bundles, {
        maxShrinkagePercent: DEFAULT_MAX_SHRINKAGE_PERCENT,
        allowShrinkage: true,
      });

      expect(errors).toHaveLength(0);
    });
  });

  describe("Gate: Secret Scanning", () => {
    it("detects PostgreSQL connection strings in bundles", () => {
      const dirty = {
        meta: { test: true },
        description: "Normal course description with postgres://user:secret@ep-cool-db.aws.neon.tech/main link",
      };
      const leaks = scanForSecrets(dirty);
      expect(leaks.some((l) => l.includes("PostgreSQL connection string"))).toBe(true);
      expect(leaks.some((l) => l.includes("Neon database endpoint hostname"))).toBe(true);
    });

    it("detects private keys or auth tokens", () => {
      const dirty = {
        token: "ghp_123456789012345678901234567890123456",
        key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----",
      };
      const leaks = scanForSecrets(dirty);
      expect(leaks.some((l) => l.includes("API token"))).toBe(true);
      expect(leaks.some((l) => l.includes("private key"))).toBe(true);
    });
  });

  describe("Quiescence and Upstream Synchronization Checking", () => {
    it("fails quiescence check if any sync table is missing completed_at or is currently running", async () => {
      const mockPool = {
        connect: async () => ({
          query: async () => ({
            rows: [
              {
                catalog: "2026-10-09T03:30:00Z",
                programs: null, // Incomplete!
                transfers: "2026-10-09T04:30:00Z",
                catalog_status: "completed",
                programs_status: "running", // Running!
                transfers_status: "completed",
              },
            ],
          }),
          release: () => {},
        }),
      } as unknown as import("pg").Pool;

      const result = await checkQuiescence(mockPool);
      expect(result.quiescent).toBe(false);
      expect(result.reasons.some((r) => r.includes("program_sync_state has no completed_at"))).toBe(true);
      expect(result.reasons.some((r) => r.includes("program_sync_state is currently running"))).toBe(true);
    });

    it("passes quiescence check when all sync jobs are completed", async () => {
      const mockPool = {
        connect: async () => ({
          query: async () => ({
            rows: [
              {
                catalog: "2026-10-09T03:30:00Z",
                programs: "2026-10-09T05:30:00Z",
                transfers: "2026-10-09T04:30:00Z",
                catalog_status: "completed",
                programs_status: "completed",
                transfers_status: "completed",
              },
            ],
          }),
          release: () => {},
        }),
      } as unknown as import("pg").Pool;

      const result = await checkQuiescence(mockPool);
      expect(result.quiescent).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.markers.catalog).toBe("2026-10-09T03:30:00Z");
    });
  });

  describe("Diffing & PR Summary Generation", () => {
    it("reports hasChanges: false when comparing identical bundles", async () => {
      const { bundles, manifest } = await getBaseFixtures();
      const diff = computeInventoryDiff(bundles, bundles);
      expect(diff.hasChanges).toBe(false);
      expect(hasDomainDifferences(manifest, manifest)).toBe(false);
    });

    it("correctly calculates additions, modifications, and deltas", async () => {
      const { bundles } = await getBaseFixtures();
      const modifiedBundles: SnapshotBundles = {
        ...bundles,
        courses: {
          ...bundles.courses,
          ids: [...bundles.courses.ids, "CS-999"],
        },
      };

      const diff = computeInventoryDiff(modifiedBundles, bundles);
      expect(diff.hasChanges).toBe(true);
      expect(diff.courses.delta).toBe(1);
      expect(diff.courses.added).toContain("CS-999");
    });

    it("generates structured markdown PR summary with domain tables and gate statuses", async () => {
      const { manifest, bundles, report, canonicalInventory } = await getBaseFixtures();
      const gateResults = validateAllGates(bundles, manifest, report, { canonicalInventory });
      const diff = computeInventoryDiff(bundles, bundles);

      const summary = generatePrSummary({
        stagedManifest: manifest,
        baselineManifest: manifest,
        diff,
        gateResults,
        syncMarkers: {
          catalog: "2026-10-09T03:00:00Z",
          programs: "2026-10-09T05:00:00Z",
          transfers: "2026-10-09T04:00:00Z",
        },
        dateStr: "2026-10-12",
      });

      expect(summary).toContain("# Weekly Automated Catalog Snapshot Update (2026-10-12)");
      expect(summary).toContain("| **Programs** | 227 | 227 | +0 |");
      expect(summary).toContain("| **Courses** | 2394 | 2394 | +0 |");
      expect(summary).toContain("✅ **manifestSchema**: PASSED");
      expect(summary).toContain("✅ **cbePrograms**: PASSED");
      expect(summary).toContain("✅ **secretScanning**: PASSED");
      expect(summary).toContain("Verify CI checks pass");
      expect(summary).toContain("Rollback");
    });
  });

  describe("Runner & Recovery Lifecycle", () => {
    it("exits cleanly with status: 'disabled' when automation flag is false", async () => {
      const origEnv = process.env.ENABLE_WEEKLY_SNAPSHOT_WORKFLOW;
      delete process.env.ENABLE_WEEKLY_SNAPSHOT_WORKFLOW;
      delete process.env.STATIC_EXPORT_APPROVED;

      const result = await runAutomatedSnapshotUpdate([]);
      expect(result.status).toBe("disabled");
      expect(result.changesDetected).toBe(false);

      if (origEnv !== undefined) process.env.ENABLE_WEEKLY_SNAPSHOT_WORKFLOW = origEnv;
    });

    it("runs dry-run using an existing stage without modifying production active snapshots", async () => {
      const { manifest, bundles } = await getBaseFixtures();
      const tmpStage = await mkdtemp(path.join(tmpdir(), "test-stage-"));

      try {
        await writeFile(path.join(tmpStage, "programs.json"), JSON.stringify(bundles.programs));
        await writeFile(path.join(tmpStage, "courses.json"), JSON.stringify(bundles.courses));
        await writeFile(path.join(tmpStage, "transfers.json"), JSON.stringify(bundles.transfers));
        await writeFile(path.join(tmpStage, "search.json"), JSON.stringify(bundles.search));
        await writeFile(path.join(tmpStage, "manifest.json"), JSON.stringify(manifest));
        await writeFile(
          path.join(tmpStage, "report.json"),
          JSON.stringify({
            fixture: false,
            provenance: manifest.provenance!,
            baseline: "approved",
            counts: { programs: 227, courses: 2394, transfers: 1236, search: 3857 },
            rawBytes: { programs: 10, courses: 10, transfers: 10, search: 10 },
            reconciliation: { courses: bundles.courses.reconciliation! },
            warnings: [],
          })
        );

        const result = await runAutomatedSnapshotUpdate([
          "--stage-dir",
          tmpStage,
          "--dry-run",
        ]);

        expect(result.status).toBe("no_changes");
        expect(result.changesDetected).toBe(false);
      } finally {
        await rm(tmpStage, { recursive: true, force: true });
      }
    });

    it("recovers safely if promotion journal is absent or empty", async () => {
      const status = await recoverSnapshotPromotion(activeDir);
      expect(status).toBe("none");
    });
  });
});
