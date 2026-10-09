import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseStaticExportArgs } from "../../../../scripts/generate-static-snapshots";
import { createManifest, loadBundles, loadManifest, promoteReviewedStage, recoverSnapshotPromotion, stageSnapshot, validateSnapshot, verifyManifest, verifyReviewedStage, type SnapshotBundles, type SnapshotProvenance } from "../snapshot";

const fixtureDirectory = path.resolve("src/data/fixtures/snapshots");
const fixtureProvenance: SnapshotProvenance = { kind: "fixture", source: "checked-in-fixture-v1", sourceDigest: "0".repeat(64), approvalReference: null, approved: false };
const approvedProvenance: SnapshotProvenance = { kind: "json-import", source: "synthetic-test", sourceDigest: "1".repeat(64), approvalReference: "TEST-27", approved: true };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

async function approvedBundles(): Promise<SnapshotBundles> {
  const bundles = clone(await loadBundles(fixtureDirectory));
  bundles.courses.meta.counts.edges = bundles.courses.edges.length;
  bundles.courses.reconciliation = {
    records: { sourceRows: bundles.courses.ids.length, exportedRecords: bundles.courses.ids.length, duplicateRows: 0, rejectedRows: 0 },
    prerequisiteEdges: { sourceRows: bundles.courses.edges.length, exportedEdges: bundles.courses.edges.length, duplicateRows: 0, rejectedRows: 0, externalReferences: 1, duplicateExternalRows: 0 },
    sourceCoverage: {
      coursesData: {
        totalRows: bundles.courses.ids.length,
        candidateRows: bundles.courses.ids.length,
        excluded: { missingCatalogCourseId: 0 },
      },
      prerequisites: {
        totalRows: bundles.courses.edges.length,
        candidateRows: bundles.courses.edges.length,
        excluded: {
          orphanClassId: 0,
          parentMissingCatalogCourseId: 0,
          missingPrerequisiteCourseId: 0,
          selfReference: 0,
        },
        unmatched: {
          externalPrerequisites: 1,
        },
      },
    },
  };
  const csProgram = bundles.programs.bySlug["computer-science-bs"];
  if (csProgram) csProgram.description = "Synthetic approved catalog data";
  const csDir = bundles.programs.directory.find((p) => p.slug === "computer-science-bs");
  if (csDir) csDir.description = "Synthetic approved catalog data";
  const csSearch = bundles.search.programs.find((program) => program.slug === "computer-science-bs");
  if (csSearch) csSearch.description = "Synthetic approved catalog data";
  return bundles;
}

describe("complete static snapshot validation and promotion", () => {
  it("validates every source relationship, count, graph, and lossless search representation", async () => {
    const bundles = await loadBundles(fixtureDirectory);
    expect(validateSnapshot(bundles, { fixture: true, provenance: fixtureProvenance }).counts).toEqual({ programs: 6, courses: 4, transfers: 16, search: 26 });
    const badProgram = clone(bundles); badProgram.programs.sitemap[0].slug = "missing";
    expect(() => validateSnapshot(badProgram, { fixture: true, provenance: fixtureProvenance })).toThrow(/sitemap/);
    const badCourse = clone(bundles); badCourse.courses.summaries[0].title = "wrong";
    expect(() => validateSnapshot(badCourse, { fixture: true, provenance: fixtureProvenance })).toThrow(/Course/);
    const badGraph = clone(bundles); badGraph.courses.edges[0].parentId = "MISSING";
    expect(() => validateSnapshot(badGraph, { fixture: true, provenance: fixtureProvenance })).toThrow(/graph/);
    const cyclicGraph = clone(bundles); cyclicGraph.courses.edges.push({ parentId: "PSY321", parentTitle: "Research Methods in Psychology II", childId: "CS210", childTitle: "Programming Languages" }, { parentId: "CS210", parentTitle: "Programming Languages", childId: "PSY321", childTitle: "Research Methods in Psychology II" });
    expect(validateSnapshot(cyclicGraph, { fixture: true, provenance: fixtureProvenance }).counts.courses).toBe(4);
    const lostOption = clone(bundles); lostOption.search.transfers.pop(); lostOption.search.meta.counts.entries--;
    expect(() => validateSnapshot(lostOption, { fixture: true, provenance: fixtureProvenance })).toThrow(/exactly/);
    const secret = clone(bundles); (secret.transfers.rows[0] as Record<string, unknown>).token = "nope";
    expect(() => validateSnapshot(secret, { fixture: true, provenance: fixtureProvenance })).toThrow(/secret/);
  });

  it("requires an approved provenance record and rejects relabeled known fixture bytes", async () => {
    const bundles = await loadBundles(fixtureDirectory);
    expect(() => validateSnapshot(bundles, { fixture: false, provenance: approvedProvenance })).toThrow(/Known fixture/);
    const synthetic = await approvedBundles();
    expect(validateSnapshot(synthetic, { fixture: false, provenance: approvedProvenance }).baseline).toBe("none");
    expect(() => validateSnapshot(synthetic, { fixture: false, provenance: { ...approvedProvenance, approvalReference: null } })).toThrow(/provenance/);
  });

  it("requires separate, explicit stage and promotion commands", () => {
    expect(parseStaticExportArgs(["--fixture"])).toMatchObject({ kind: "stage", source: { kind: "fixture" } });
    expect(() => parseStaticExportArgs(["--from-json", "/tmp/export"])).toThrow(/approval-reference/);
    expect(() => parseStaticExportArgs(["--fixture", "--promote"])).toThrow(/Review a stage/);
    expect(() => parseStaticExportArgs(["--promote-stage", "/tmp/export"])).not.toThrow();
  });

  it("writes a reviewable stage, verifies manifest counts and rejects baseline record loss", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "snapshot-test-")); const active = path.join(root, "active"); await mkdir(active);
    const bundles = await approvedBundles();
    const stage = await stageSnapshot(bundles, active, { fixture: false, provenance: approvedProvenance });
    try {
      expect((await loadManifest(stage.directory))?.provenance?.approvalReference).toBe("TEST-27");
      await expect(verifyReviewedStage(stage.directory, active, null, false)).rejects.toThrow(/acknowledge/);
      await expect(verifyReviewedStage(path.join(root, "untrusted"), active, null, true)).rejects.toThrow(/controlled/);
      const manifest = stage.manifest;
      expect(() => verifyManifest(bundles, { ...manifest, domains: { ...manifest.domains, transfers: { ...manifest.domains.transfers, counts: { rows: 99 } } } })).toThrow(/Manifest/);
      const baseline = createManifest(bundles, false, approvedProvenance);
      baseline.domains.transfers.counts.rows = 100;
      expect(() => validateSnapshot(bundles, { fixture: false, provenance: approvedProvenance, baseline })).toThrow(/fell below/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("activates the exact reviewed stage and leaves the previous active snapshot as a recoverable backup", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "snapshot-test-")); const active = path.join(root, "active"); await mkdir(active); await writeFile(path.join(active, "old"), "old");
    const stage = await stageSnapshot(await approvedBundles(), active, { fixture: false, provenance: approvedProvenance });
    try {
      const reviewed = await verifyReviewedStage(stage.directory, active, null, true);
      const expected = reviewed.manifest.domains.programs.sha256;
      const backup = await promoteReviewedStage(stage.directory, active, null, true);
      expect(JSON.parse(await readFile(path.join(active, "manifest.json"), "utf8")).domains.programs.sha256).toBe(expected);
      expect(await readFile(path.join(backup, "old"), "utf8")).toBe("old");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("recovers interruptions before activation and finalizes an interruption after activation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "snapshot-test-")); const active = path.join(root, "active"); const backup = path.join(root, ".snapshots.previous-test"); const stage = path.join(root, ".snapshot-stage-test"); await mkdir(active); await writeFile(path.join(active, "old"), "old"); await mkdir(stage);
    const journal = path.join(root, ".snapshot-promotion.json");
    try {
      await rename(active, backup); await writeFile(journal, JSON.stringify({ active, backup, stage, phase: "active-moved" }));
      expect(await recoverSnapshotPromotion(active)).toBe("restored"); expect(await readFile(path.join(active, "old"), "utf8")).toBe("old");
      await writeFile(journal, JSON.stringify({ active, backup, stage, phase: "activated" }));
      expect(await recoverSnapshotPromotion(active)).toBe("finalized");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("validates course source coverage balance and exposes categories in report", async () => {
    const bundles = await approvedBundles();
    bundles.courses.reconciliation = {
      records: { sourceRows: 4, exportedRecords: 3, duplicateRows: 1, rejectedRows: 0 },
      prerequisiteEdges: { sourceRows: 3, exportedEdges: 2, duplicateRows: 1, rejectedRows: 0, externalReferences: 1, duplicateExternalRows: 0 },
      sourceCoverage: {
        coursesData: {
          totalRows: 6,
          candidateRows: 4,
          excluded: { missingCatalogCourseId: 2 },
        },
        prerequisites: {
          totalRows: 7,
          candidateRows: 3,
          excluded: {
            orphanClassId: 1,
            parentMissingCatalogCourseId: 1,
            missingPrerequisiteCourseId: 1,
            selfReference: 1,
          },
          unmatched: {
            externalPrerequisites: 1,
          },
        },
      },
    };
    bundles.courses.ids = ["CS210", "ENG120", "IT140"];
    bundles.courses.summaries = [
      { catalog_course_id: "CS210", title: "Programming" },
      { catalog_course_id: "ENG120", title: "Composition" },
      { catalog_course_id: "IT140", title: "Scripting" },
    ];
    bundles.courses.records = {
      CS210: { catalog_course_id: "CS210", title: "Programming", pid: "1", description: null, academic_level: null, credits: null, subject_code: null },
      ENG120: { catalog_course_id: "ENG120", title: "Composition", pid: "2", description: null, academic_level: null, credits: null, subject_code: null },
      IT140: { catalog_course_id: "IT140", title: "Scripting", pid: "3", description: null, academic_level: null, credits: null, subject_code: null },
    };
    bundles.courses.edges = [
      { parentId: "CS210", parentTitle: "Programming", childId: "IT140", childTitle: "Scripting" },
      { parentId: "CS210", parentTitle: "Programming", childId: "MAT999", childTitle: "Calculus Preparation" },
    ];
    bundles.courses.meta.counts = { ids: 3, records: 3, edges: 2 };
    bundles.search.courses = bundles.courses.summaries;
    bundles.search.meta.counts.entries = bundles.search.programs.length + bundles.search.courses.length + bundles.search.transfers.length;

    const report = validateSnapshot(bundles, { fixture: false, provenance: approvedProvenance });
    expect(report.sourceCoverage?.courses).toEqual(bundles.courses.reconciliation.sourceCoverage);
    expect(report.reconciliation.courses?.sourceCoverage).toEqual(bundles.courses.reconciliation.sourceCoverage);

    const missingCoverage = clone(bundles);
    delete (missingCoverage.courses.reconciliation as { sourceCoverage?: unknown }).sourceCoverage;
    expect(() => validateSnapshot(missingCoverage, { fixture: false, provenance: approvedProvenance })).toThrow(/Approved real-data snapshots require course source coverage reconciliation/);

    const unbalanced = clone(bundles);
    unbalanced.courses.reconciliation!.sourceCoverage!.coursesData.totalRows = 999;
    expect(() => validateSnapshot(unbalanced, { fixture: false, provenance: approvedProvenance })).toThrow(/courses_data source coverage does not balance/);

    const withDuplicateExternal = clone(bundles);
    withDuplicateExternal.courses.reconciliation!.prerequisiteEdges = {
      sourceRows: 4,
      exportedEdges: 2,
      duplicateRows: 2,
      rejectedRows: 0,
      externalReferences: 1,
      duplicateExternalRows: 1,
    };
    withDuplicateExternal.courses.reconciliation!.sourceCoverage!.prerequisites.candidateRows = 4;
    withDuplicateExternal.courses.reconciliation!.sourceCoverage!.prerequisites.totalRows = 8;
    withDuplicateExternal.courses.reconciliation!.sourceCoverage!.prerequisites.unmatched.externalPrerequisites = 2;
    expect(validateSnapshot(withDuplicateExternal, { fixture: false, provenance: approvedProvenance }).counts.courses).toBe(3);
  });
});
