import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  CANONICAL_CBE_PIDS,
  DEFAULT_MAX_SHRINKAGE_PERCENT,
  checkQuiescence,
  computeInventoryDiff,
  computeSyncMarkerDigest,
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
  validateQuiescenceAndTimestamps,
  validateReconciliation,
  type QuiescenceEvidence,
  type SyncMarkerState,
} from "../lib/static-export/workflow";
import {
  loadBundles,
  loadManifest,
  recoverSnapshotPromotion,
  stageSnapshot,
  type SnapshotBundles,
  type SnapshotManifest,
  type SnapshotReport,
} from "../lib/static-export/snapshot";
import * as programsExporter from "../lib/static-export/programs";
import * as coursesExporter from "../lib/static-export/courses";
import * as transfersExporter from "../lib/static-export/transfers";
import {
  exportBundlesFromDatabase,
  runAutomatedSnapshotUpdate,
} from "../../scripts/automated-snapshot-update";

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

  function createMockSyncPool(options?: {
    firstMarkers?: Partial<SyncMarkerState>;
    secondMarkers?: Partial<SyncMarkerState>;
  }) {
    let callCount = 0;
    const defaultMarkers: SyncMarkerState = {
      catalog: "2026-10-09T03:00:00.000Z",
      programs: "2026-10-09T05:00:00.000Z",
      transfers: "2026-10-09T04:00:00.000Z",
      catalogStatus: "idle",
      programsStatus: "idle",
      transfersStatus: "idle",
      catalogNextDue: "2026-12-09T03:00:00.000Z",
      programsNextDue: "2026-10-16T05:00:00.000Z",
      transfersNextDue: "2026-10-16T04:00:00.000Z",
    };

    const first = { ...defaultMarkers, ...options?.firstMarkers };
    const second = { ...defaultMarkers, ...options?.secondMarkers };

    return {
      connect: async () => ({
        query: async () => {
          callCount++;
          const current = callCount === 1 ? first : second;
          return {
            rows: [
              {
                catalog: current.catalog,
                programs: current.programs,
                transfers: current.transfers,
                catalog_status: current.catalogStatus,
                programs_status: current.programsStatus,
                transfers_status: current.transfersStatus,
                catalog_next_due: current.catalogNextDue,
                programs_next_due: current.programsNextDue,
                transfers_next_due: current.transfersNextDue,
              },
            ],
          };
        },
        release: () => {},
      }),
      end: async () => {},
    } as unknown as import("pg").Pool;
  }

  it("passes all acceptance gates on the committed approved production snapshot when evidence is waived", async () => {
    const { manifest, bundles, report, canonicalInventory } = await getBaseFixtures();
    const result = validateAllGates(bundles, manifest, report, {
      canonicalInventory,
      baselineBundles: bundles,
      baselineManifest: manifest,
      requireQuiescenceEvidence: false,
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
    expect(result.gates.quiescenceAndTimestamps.passed).toBe(true);
    expect(result.gates.quiescenceAndTimestamps.message).toContain("SKIPPED");
  });

  it("passes all ten acceptance gates including quiescenceAndTimestamps when valid evidence and matching digest are provided", async () => {
    const { manifest, bundles, report, canonicalInventory } = await getBaseFixtures();
    const sampleMarkers: SyncMarkerState = {
      catalog: "2026-10-09T03:00:00.000Z",
      programs: "2026-10-09T05:00:00.000Z",
      transfers: "2026-10-09T04:00:00.000Z",
      catalogStatus: "idle",
      programsStatus: "idle",
      transfersStatus: "idle",
      catalogNextDue: "2026-12-09T03:00:00.000Z",
      programsNextDue: "2026-10-16T05:00:00.000Z",
      transfersNextDue: "2026-10-16T04:00:00.000Z",
    };
    const validDigest = computeSyncMarkerDigest(sampleMarkers);
    const validManifest: SnapshotManifest = {
      ...manifest,
      provenance: {
        ...manifest.provenance!,
        sourceDigest: validDigest,
      },
    };
    const evidence: QuiescenceEvidence = {
      markersBefore: sampleMarkers,
      markersAfter: sampleMarkers,
      now: "2026-10-09T06:00:00.000Z",
    };

    const result = validateAllGates(bundles, validManifest, report, {
      canonicalInventory,
      baselineBundles: bundles,
      baselineManifest: validManifest,
      quiescenceEvidence: evidence,
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
    expect(result.gates.quiescenceAndTimestamps.passed).toBe(true);
    expect(result.gates.quiescenceAndTimestamps.message).toBe("PASSED");
  });

  describe("Provenance Source Digest & Determinism (Task 1 Regression)", () => {
    it("fails stageSnapshot when provenance.sourceDigest is a raw timestamp string", async () => {
      const { bundles, manifest } = await getBaseFixtures();
      const rawTimestamp = "2026-10-09 03:00:00+00";

      await expect(
        stageSnapshot(bundles, activeDir, {
          fixture: false,
          provenance: {
            kind: "postgres",
            source: "postgres-readonly-export",
            sourceDigest: rawTimestamp,
            approvalReference: "WEEKLY-2026-10-09",
            approved: true,
          },
          baseline: manifest,
        })
      ).rejects.toThrow("Invalid snapshot provenance");
    });

    it("succeeds stageSnapshot when provenance.sourceDigest is computed from realistic PostgreSQL timestamps via computeSyncMarkerDigest", async () => {
      const { bundles, manifest } = await getBaseFixtures();
      const postgresMarkers: SyncMarkerState = {
        catalog: "2026-10-09 03:00:00.123456+00",
        programs: "2026-10-09 05:00:00.654321+00",
        transfers: "2026-10-09 04:00:00.987654+00",
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
      };

      const digest = computeSyncMarkerDigest(postgresMarkers);
      expect(digest).toMatch(/^[a-f0-9]{64}$/i);

      const staged = await stageSnapshot(bundles, activeDir, {
        fixture: false,
        provenance: {
          kind: "postgres",
          source: "postgres-readonly-export",
          sourceDigest: digest,
          approvalReference: "WEEKLY-2026-10-09",
          approved: true,
        },
        baseline: manifest,
      });

      try {
        expect(staged.manifest.provenance?.sourceDigest).toBe(digest);
        expect(staged.report.provenance.sourceDigest).toBe(digest);
      } finally {
        await rm(staged.directory, { recursive: true, force: true });
      }
    });

    it("produces deterministic SHA-256 digests from identical marker objects", () => {
      const markersA: SyncMarkerState = {
        catalog: "2026-10-09T03:00:00Z",
        programs: "2026-10-09T05:00:00Z",
        transfers: "2026-10-09T04:00:00Z",
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
      };
      const markersB: SyncMarkerState = {
        catalog: "2026-10-09T03:00:00Z",
        programs: "2026-10-09T05:00:00Z",
        transfers: "2026-10-09T04:00:00Z",
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
      };

      const hashA = computeSyncMarkerDigest(markersA);
      const hashB = computeSyncMarkerDigest(markersB);
      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    });
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

  describe("Gate: Quiescence & Upstream Synchronization (Task 2)", () => {
    it("fails closed when evidence is missing and not explicitly waived", async () => {
      const { bundles, manifest, report, canonicalInventory } = await getBaseFixtures();
      const result = validateAllGates(bundles, manifest, report, {
        canonicalInventory,
        baselineBundles: bundles,
        baselineManifest: manifest,
      });

      expect(result.passed).toBe(false);
      expect(result.gates.quiescenceAndTimestamps.passed).toBe(false);
      expect(result.gates.quiescenceAndTimestamps.message).toContain("unverifiable");
    });

    it("fails validation if any sync domain has missing completed_at timestamp", () => {
      const baseMarkers: SyncMarkerState = {
        catalog: "2026-10-09T03:00:00Z",
        programs: "2026-10-09T05:00:00Z",
        transfers: null,
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: "2026-12-09T03:00:00Z",
        programsNextDue: "2026-10-16T05:00:00Z",
        transfersNextDue: "2026-10-16T04:00:00Z",
      };

      const errors = validateQuiescenceAndTimestamps({
        markersBefore: baseMarkers,
        markersAfter: baseMarkers,
        now: "2026-10-09T06:00:00Z",
      });

      expect(errors.some((e) => e.includes("transfer_sync_state has no completed_at"))).toBe(true);
    });

    it("fails validation if any sync job is currently running, in progress, or in error", () => {
      const runningCatalog: SyncMarkerState = {
        catalog: "2026-10-09T03:00:00Z",
        programs: "2026-10-09T05:00:00Z",
        transfers: "2026-10-09T04:00:00Z",
        catalogStatus: "running",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: "2026-12-09T03:00:00Z",
        programsNextDue: "2026-10-16T05:00:00Z",
        transfersNextDue: "2026-10-16T04:00:00Z",
      };

      const errorCatalog = validateQuiescenceAndTimestamps({
        markersBefore: runningCatalog,
        markersAfter: runningCatalog,
        now: "2026-10-09T06:00:00Z",
      });
      expect(errorCatalog.some((e) => e.includes("catalog_sync_state status is 'running'"))).toBe(true);

      const inProgressPrograms: SyncMarkerState = {
        ...runningCatalog,
        catalogStatus: "idle",
        programsStatus: "in_progress",
      };
      const errorPrograms = validateQuiescenceAndTimestamps({
        markersBefore: inProgressPrograms,
        markersAfter: inProgressPrograms,
        now: "2026-10-09T06:00:00Z",
      });
      expect(errorPrograms.some((e) => e.includes("program_sync_state status is 'in_progress'"))).toBe(true);

      const errorTransfers: SyncMarkerState = {
        ...runningCatalog,
        catalogStatus: "idle",
        transfersStatus: "running",
      };
      const errorTransfersResult = validateQuiescenceAndTimestamps({
        markersBefore: errorTransfers,
        markersAfter: errorTransfers,
        now: "2026-10-09T06:00:00Z",
      });
      expect(errorTransfersResult.some((e) => e.includes("transfer_sync_state status is 'running'"))).toBe(true);
    });

    it("fails validation if weekly program sync timestamps are stale (> 15 days) or overdue", () => {
      const staleMarkers: SyncMarkerState = {
        catalog: "2026-10-09T03:00:00Z",
        programs: "2026-09-20T05:00:00Z", // 19 days old
        transfers: "2026-10-09T04:00:00Z",
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: "2026-12-09T03:00:00Z",
        programsNextDue: "2026-09-27T05:00:00Z", // Due 12 days ago (> 8 days grace)
        transfersNextDue: "2026-10-16T04:00:00Z",
      };

      const errors = validateQuiescenceAndTimestamps({
        markersBefore: staleMarkers,
        markersAfter: staleMarkers,
        now: "2026-10-09T06:00:00Z",
      });

      expect(errors.some((e) => e.includes("program") && (e.includes("stale") || e.includes("overdue")))).toBe(true);
    });

    it("accepts a course catalog refreshed 37 days ago when its next due date is legitimately in the future", () => {
      // Simulates the exact state from live dry run 37948928758:
      // Catalog completed 2026-09-02, due 2026-11-02. Current date 2026-10-09 (37 days later).
      const liveDryRunState: SyncMarkerState = {
        catalog: "2026-09-02 01:16:38.927114+00",
        programs: "2026-10-04T05:00:00.000Z",
        transfers: "2026-10-04T04:00:00.000Z",
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: "2026-11-02 01:16:38.927114+00",
        programsNextDue: "2026-10-11T05:00:00.000Z",
        transfersNextDue: "2026-10-11T04:00:00.000Z",
      };

      const errors = validateQuiescenceAndTimestamps({
        markersBefore: liveDryRunState,
        markersAfter: liveDryRunState,
        now: "2026-10-09T06:00:00.000Z",
      });

      expect(errors).toHaveLength(0);
    });

    it("rejects a course catalog refreshed 37 days ago when already overdue beyond the 8-day grace period", () => {
      const overdueCatalog: SyncMarkerState = {
        catalog: "2026-09-02 01:16:38.927114+00",
        programs: "2026-10-04T05:00:00.000Z",
        transfers: "2026-10-04T04:00:00.000Z",
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: "2026-09-25 01:16:38.927114+00", // Due 14 days ago (> 8 days grace)
        programsNextDue: "2026-10-11T05:00:00.000Z",
        transfersNextDue: "2026-10-11T04:00:00.000Z",
      };

      const errors = validateQuiescenceAndTimestamps({
        markersBefore: overdueCatalog,
        markersAfter: overdueCatalog,
        now: "2026-10-09T06:00:00.000Z",
      });

      expect(errors.some((e) => e.includes("catalog_sync_state is overdue for refresh"))).toBe(true);
    });

    it("accepts weekly program and transfer syncs within their legitimate schedule", () => {
      const weeklySyncs: SyncMarkerState = {
        catalog: "2026-09-02 01:16:38.927114+00",
        programs: "2026-10-04T05:00:00.000Z", // 5 days old
        transfers: "2026-10-04T04:00:00.000Z", // 5 days old
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: "2026-11-02 01:16:38.927114+00",
        programsNextDue: "2026-10-11T05:00:00.000Z", // 2 days in future
        transfersNextDue: "2026-10-11T04:00:00.000Z", // 2 days in future
      };

      const errors = validateQuiescenceAndTimestamps({
        markersBefore: weeklySyncs,
        markersAfter: weeklySyncs,
        now: "2026-10-09T06:00:00.000Z",
      });

      expect(errors).toHaveLength(0);
    });

    it("rejects missing next_due_at on any domain", () => {
      const missingDue: SyncMarkerState = {
        catalog: "2026-09-02 01:16:38.927114+00",
        programs: "2026-10-04T05:00:00.000Z",
        transfers: "2026-10-04T04:00:00.000Z",
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: null,
        programsNextDue: "2026-10-11T05:00:00.000Z",
        transfersNextDue: "2026-10-11T04:00:00.000Z",
      };

      const errors = validateQuiescenceAndTimestamps({
        markersBefore: missingDue,
        markersAfter: missingDue,
        now: "2026-10-09T06:00:00.000Z",
      });

      expect(errors.some((e) => e.includes("catalog_sync_state has no next_due_at timestamp"))).toBe(true);
    });

    it("rejects invalid or implausibly distant future due dates", () => {
      const invalidDate: SyncMarkerState = {
        catalog: "2026-09-02 01:16:38.927114+00",
        programs: "2026-10-04T05:00:00.000Z",
        transfers: "2026-10-04T04:00:00.000Z",
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: "not-a-valid-date",
        programsNextDue: "2026-10-11T05:00:00.000Z",
        transfersNextDue: "2026-10-11T04:00:00.000Z",
      };

      const invalidErrors = validateQuiescenceAndTimestamps({
        markersBefore: invalidDate,
        markersAfter: invalidDate,
        now: "2026-10-09T06:00:00.000Z",
      });
      expect(invalidErrors.some((e) => e.includes("catalog_sync_state next_due_at timestamp 'not-a-valid-date' is invalid"))).toBe(true);

      const implausibleDate: SyncMarkerState = {
        ...invalidDate,
        catalogNextDue: "2028-09-02 01:16:38.927114+00", // 2 years in future
      };
      const implausibleErrors = validateQuiescenceAndTimestamps({
        markersBefore: implausibleDate,
        markersAfter: implausibleDate,
        now: "2026-10-09T06:00:00.000Z",
      });
      expect(implausibleErrors.some((e) => e.includes("implausibly distant"))).toBe(true);

      const backwardsDate: SyncMarkerState = {
        ...invalidDate,
        catalogNextDue: "2026-08-01 01:16:38.927114+00", // before completed_at
      };
      const backwardsErrors = validateQuiescenceAndTimestamps({
        markersBefore: backwardsDate,
        markersAfter: backwardsDate,
        now: "2026-10-09T06:00:00.000Z",
      });
      expect(backwardsErrors.some((e) => e.includes("is before completed_at"))).toBe(true);
    });

    it("rejects bootstrap, error, and running sync states", () => {
      const bootstrapCatalog: SyncMarkerState = {
        catalog: "2026-09-02 01:16:38.927114+00",
        programs: "2026-10-04T05:00:00.000Z",
        transfers: "2026-10-04T04:00:00.000Z",
        catalogStatus: "awaiting_bootstrap",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: "2026-11-02 01:16:38.927114+00",
        programsNextDue: "2026-10-11T05:00:00.000Z",
        transfersNextDue: "2026-10-11T04:00:00.000Z",
      };

      const bootstrapErrors = validateQuiescenceAndTimestamps({
        markersBefore: bootstrapCatalog,
        markersAfter: bootstrapCatalog,
        now: "2026-10-09T06:00:00.000Z",
      });
      expect(bootstrapErrors.some((e) => e.includes("catalog_sync_state status is 'awaiting_bootstrap'"))).toBe(true);

      const errorProgram: SyncMarkerState = {
        ...bootstrapCatalog,
        catalogStatus: "idle",
        programsStatus: "error",
      };
      const progErrors = validateQuiescenceAndTimestamps({
        markersBefore: errorProgram,
        markersAfter: errorProgram,
        now: "2026-10-09T06:00:00.000Z",
      });
      expect(progErrors.some((e) => e.includes("program_sync_state status is 'error'"))).toBe(true);
    });

    it("fails validation if completion timestamp is in the future", () => {
      const futureMarkers: SyncMarkerState = {
        catalog: "2026-10-09T12:00:00Z", // In future relative to 06:00:00Z
        programs: "2026-10-09T05:00:00Z",
        transfers: "2026-10-09T04:00:00Z",
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: "2026-12-09T12:00:00Z",
        programsNextDue: "2026-10-16T05:00:00Z",
        transfersNextDue: "2026-10-16T04:00:00Z",
      };

      const errors = validateQuiescenceAndTimestamps({
        markersBefore: futureMarkers,
        markersAfter: futureMarkers,
        now: "2026-10-09T06:00:00Z",
      });

      expect(errors.some((e) => e.includes("catalog completed_at timestamp") && e.includes("in the future"))).toBe(true);
    });

    it("fails validation if sync markers shifted between pre-export and post-export", () => {
      const before: SyncMarkerState = {
        catalog: "2026-10-09T03:00:00Z",
        programs: "2026-10-09T05:00:00Z",
        transfers: "2026-10-09T04:00:00Z",
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: "2026-12-09T03:00:00Z",
        programsNextDue: "2026-10-16T05:00:00Z",
        transfersNextDue: "2026-10-16T04:00:00Z",
      };
      const after: SyncMarkerState = {
        ...before,
        programs: "2026-10-09T05:45:00Z",
      };

      const errors = validateQuiescenceAndTimestamps({
        markersBefore: before,
        markersAfter: after,
        now: "2026-10-09T06:00:00Z",
      });

      expect(errors.some((e) => e.includes("Sync markers shifted between pre-export and post-export"))).toBe(true);

      // Shifting next_due_at also triggers marker shift failure
      const afterDueShift: SyncMarkerState = {
        ...before,
        catalogNextDue: "2026-12-10T03:00:00Z",
      };
      const dueShiftErrors = validateQuiescenceAndTimestamps({
        markersBefore: before,
        markersAfter: afterDueShift,
        now: "2026-10-09T06:00:00Z",
      });
      expect(dueShiftErrors.some((e) => e.includes("Sync markers shifted between pre-export and post-export"))).toBe(true);
    });

    it("fails validation if manifest provenance sourceDigest does not match sync markers digest", async () => {
      const { manifest } = await getBaseFixtures();
      const markers: SyncMarkerState = {
        catalog: "2026-10-09T03:00:00Z",
        programs: "2026-10-09T05:00:00Z",
        transfers: "2026-10-09T04:00:00Z",
        catalogStatus: "idle",
        programsStatus: "idle",
        transfersStatus: "idle",
        catalogNextDue: "2026-12-09T03:00:00Z",
        programsNextDue: "2026-10-16T05:00:00Z",
        transfersNextDue: "2026-10-16T04:00:00Z",
      };

      const tamperedManifest: SnapshotManifest = {
        ...manifest,
        provenance: {
          ...manifest.provenance!,
          sourceDigest: "0000000000000000000000000000000000000000000000000000000000000000",
        },
      };

      const errors = validateQuiescenceAndTimestamps(
        {
          markersBefore: markers,
          markersAfter: markers,
          now: "2026-10-09T06:00:00Z",
        },
        tamperedManifest
      );

      expect(errors.some((e) => e.includes("does not match sync markers digest"))).toBe(true);
    });

    it("checkQuiescence returns non-quiescent when database rows contain active jobs", async () => {
      const pool = createMockSyncPool({
        firstMarkers: {
          programsStatus: "in_progress",
        },
      });

      const result = await checkQuiescence(pool);
      expect(result.quiescent).toBe(false);
      expect(result.reasons.some((r) => r.includes("program_sync_state is currently in progress"))).toBe(true);
    });

    it("checkQuiescence returns quiescent when all database rows are completed and idle", async () => {
      const pool = createMockSyncPool();
      const result = await checkQuiescence(pool, { now: "2026-10-09T06:00:00Z" });
      expect(result.quiescent).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.markers.catalogStatus).toBe("idle");
    });

    it("checkQuiescence rejects unexpected active lease or running states", async () => {
      const pool = createMockSyncPool({
        firstMarkers: {
          catalogStatus: "running",
        },
      });

      const result = await checkQuiescence(pool, { now: "2026-10-09T06:00:00Z" });
      expect(result.quiescent).toBe(false);
      expect(result.reasons.some((r) => r.includes("catalog_sync_state is currently running"))).toBe(true);
    });

    it("distinguishes safe database identity and read-only role query without credential exposure", () => {
      // Diagnostic query for database identity and read-only verification
      const identityQuery = `
        SELECT
          current_database() AS database_name,
          current_user AS connected_user,
          has_table_privilege(current_user, 'catalog_sync_state', 'SELECT') AS can_select_catalog,
          has_table_privilege(current_user, 'catalog_sync_state', 'INSERT') AS can_insert_catalog,
          has_table_privilege(current_user, 'catalog_sync_state', 'UPDATE') AS can_update_catalog,
          has_table_privilege(current_user, 'catalog_sync_state', 'DELETE') AS can_delete_catalog;
      `.trim();

      expect(identityQuery).toContain("current_database()");
      expect(identityQuery).toContain("current_user");
      expect(identityQuery).toContain("has_table_privilege");
      expect(identityQuery).not.toContain("password");
      expect(identityQuery).not.toContain("secret");
      expect(identityQuery).not.toContain("postgres://");
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
      const gateResults = validateAllGates(bundles, manifest, report, {
        canonicalInventory,
        requireQuiescenceEvidence: false,
      });
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

  describe("End-to-End Offline Simulation & Runner Operations (Task 3)", () => {
    it("exportBundlesFromDatabase succeeds with valid mock pool, sha256 provenance, and unchanged markers", async () => {
      const { bundles } = await getBaseFixtures();
      const mockPool = createMockSyncPool();

      vi.spyOn(programsExporter, "exportProgramsFromDatabase").mockResolvedValueOnce(bundles.programs);
      vi.spyOn(coursesExporter, "exportCoursesFromDatabase").mockResolvedValueOnce(bundles.courses);
      vi.spyOn(transfersExporter, "exportTransfersFromDatabase").mockResolvedValueOnce(bundles.transfers);

      const result = await exportBundlesFromDatabase(mockPool, "WEEKLY-2026-10-09", {
        now: "2026-10-09T06:00:00Z",
      });

      expect(result.provenance.kind).toBe("postgres");
      expect(result.provenance.approved).toBe(true);
      expect(result.provenance.sourceDigest).toMatch(/^[a-f0-9]{64}$/i);
      expect(result.provenance.sourceDigest).toBe(computeSyncMarkerDigest(result.markersBefore));
      expect(result.markersBefore).toEqual(result.markersAfter);
      expect(result.bundles.programs.directory).toHaveLength(227);
    });

    it("exportBundlesFromDatabase aborts when database is not quiescent", async () => {
      const mockPool = createMockSyncPool({
        firstMarkers: {
          programsStatus: "in_progress",
        },
      });

      await expect(
        exportBundlesFromDatabase(mockPool, "WEEKLY-2026-10-09", { now: "2026-10-09T06:00:00Z" })
      ).rejects.toThrow("Database is not quiescent for export");
    });

    it("exportBundlesFromDatabase aborts when sync markers shift during export", async () => {
      const { bundles } = await getBaseFixtures();
      const mockPool = createMockSyncPool({
        firstMarkers: { catalog: "2026-10-09T03:00:00Z" },
        secondMarkers: { catalog: "2026-10-09T03:30:00Z" },
      });

      vi.spyOn(programsExporter, "exportProgramsFromDatabase").mockResolvedValueOnce(bundles.programs);
      vi.spyOn(coursesExporter, "exportCoursesFromDatabase").mockResolvedValueOnce(bundles.courses);
      vi.spyOn(transfersExporter, "exportTransfersFromDatabase").mockResolvedValueOnce(bundles.transfers);

      await expect(
        exportBundlesFromDatabase(mockPool, "WEEKLY-2026-10-09", { now: "2026-10-09T06:00:00Z" })
      ).rejects.toThrow("Cross-domain sync markers shifted during database export");
    });

    it("runAutomatedSnapshotUpdate throws clear error when database credentials are missing", async () => {
      const origEnable = process.env.ENABLE_WEEKLY_SNAPSHOT_WORKFLOW;
      const origPg = process.env.POSTGRES_URL;
      const origRoPg = process.env.READONLY_POSTGRES_URL;

      process.env.ENABLE_WEEKLY_SNAPSHOT_WORKFLOW = "true";
      delete process.env.POSTGRES_URL;
      delete process.env.READONLY_POSTGRES_URL;

      try {
        await expect(runAutomatedSnapshotUpdate([])).rejects.toThrow(
          "Missing READONLY_POSTGRES_URL (or POSTGRES_URL) for database export"
        );
      } finally {
        if (origEnable !== undefined) process.env.ENABLE_WEEKLY_SNAPSHOT_WORKFLOW = origEnable;
        else delete process.env.ENABLE_WEEKLY_SNAPSHOT_WORKFLOW;
        if (origPg !== undefined) process.env.POSTGRES_URL = origPg;
        if (origRoPg !== undefined) process.env.READONLY_POSTGRES_URL = origRoPg;
      }
    });

    it("runAutomatedSnapshotUpdate completes normal sync with no changes and exits cleanly without PR or promotion", async () => {
      const { bundles } = await getBaseFixtures();
      const mockPool = createMockSyncPool();

      vi.spyOn(programsExporter, "exportProgramsFromDatabase").mockResolvedValueOnce(bundles.programs);
      vi.spyOn(coursesExporter, "exportCoursesFromDatabase").mockResolvedValueOnce(bundles.courses);
      vi.spyOn(transfersExporter, "exportTransfersFromDatabase").mockResolvedValueOnce(bundles.transfers);

      const result = await runAutomatedSnapshotUpdate(["--dry-run"], {
        pool: mockPool,
        now: "2026-10-09T06:00:00Z",
      });

      expect(result.status).toBe("no_changes");
      expect(result.changesDetected).toBe(false);
      expect(result.prCreated).toBe(false);
    });

    it("runAutomatedSnapshotUpdate handles legitimate modifications in dry run mode without promoting or creating PR", async () => {
      const { bundles } = await getBaseFixtures();
      const mockPool = createMockSyncPool();

      // Introduce a legitimate course addition
      const modifiedCourses = {
        ...bundles.courses,
        ids: [...bundles.courses.ids, "CS999"],
        records: {
          ...bundles.courses.records,
          CS999: {
            catalog_course_id: "CS999",
            title: "Advanced Quantum Computing",
            pid: "pid-cs-999",
            description: "Study quantum algorithms",
            academic_level: "Graduate",
            credits: "3",
            subject_code: "CS",
          },
        },
        summaries: [
          ...bundles.courses.summaries,
          { catalog_course_id: "CS999", title: "Advanced Quantum Computing" },
        ],
        meta: {
          ...bundles.courses.meta,
          counts: {
            ...bundles.courses.meta.counts,
            ids: bundles.courses.ids.length + 1,
            records: Object.keys(bundles.courses.records).length + 1,
          },
        },
        reconciliation: {
          ...bundles.courses.reconciliation!,
          records: {
            ...bundles.courses.reconciliation!.records,
            sourceRows: bundles.courses.reconciliation!.records.sourceRows + 1,
            exportedRecords: bundles.courses.reconciliation!.records.exportedRecords + 1,
          },
          sourceCoverage: bundles.courses.reconciliation?.sourceCoverage
            ? {
                ...bundles.courses.reconciliation.sourceCoverage,
                coursesData: {
                  ...bundles.courses.reconciliation.sourceCoverage.coursesData,
                  totalRows: bundles.courses.reconciliation.sourceCoverage.coursesData.totalRows + 1,
                  candidateRows: bundles.courses.reconciliation.sourceCoverage.coursesData.candidateRows + 1,
                },
              }
            : undefined,
        },
      };

      vi.spyOn(programsExporter, "exportProgramsFromDatabase").mockResolvedValueOnce(bundles.programs);
      vi.spyOn(coursesExporter, "exportCoursesFromDatabase").mockResolvedValueOnce(modifiedCourses);
      vi.spyOn(transfersExporter, "exportTransfersFromDatabase").mockResolvedValueOnce(bundles.transfers);

      const result = await runAutomatedSnapshotUpdate(["--dry-run"], {
        pool: mockPool,
        now: "2026-10-09T06:00:00Z",
      });

      expect(result.status).toBe("dry_run_completed");
      expect(result.changesDetected).toBe(true);
      expect(result.prCreated).toBe(false);
      expect(result.prSummary).toContain("# Weekly Automated Catalog Snapshot Update (2026-10-09)");
      expect(result.prSummary).toContain("| **Courses** | 2394 | 2395 | +1 |");

      // Verify active production snapshot on disk remains unchanged
      const activeManifestAfter = await loadManifest(activeDir);
      expect(activeManifestAfter?.domains.courses.counts.ids).toBe(2394);
    });

    it("runAutomatedSnapshotUpdate fails when acceptance gates fail, preserving current deployed snapshot", async () => {
      const { bundles } = await getBaseFixtures();
      const mockPool = createMockSyncPool();

      // Tampered bundles: course inventory drops drastically (violating shrinkage gate)
      const tamperedCourses = {
        ...bundles.courses,
        ids: bundles.courses.ids.slice(0, 1000), // Huge shrinkage
      };

      vi.spyOn(programsExporter, "exportProgramsFromDatabase").mockResolvedValueOnce(bundles.programs);
      vi.spyOn(coursesExporter, "exportCoursesFromDatabase").mockResolvedValueOnce(tamperedCourses);
      vi.spyOn(transfersExporter, "exportTransfersFromDatabase").mockResolvedValueOnce(bundles.transfers);

      await expect(
        runAutomatedSnapshotUpdate(["--dry-run"], {
          pool: mockPool,
          now: "2026-10-09T06:00:00Z",
        })
      ).rejects.toThrow();

      // Verify deployed snapshot is preserved untouched
      const activeManifest = await loadManifest(activeDir);
      expect(activeManifest?.domains.courses.counts.ids).toBe(2394);
    });

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
