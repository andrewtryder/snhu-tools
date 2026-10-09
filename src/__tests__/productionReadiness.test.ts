import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeDegreeLevel, calculateKnownCreditSummary } from "@/lib/kualiParser";
import { RequirementGroupDomain } from "@/types/domainCatalog";

describe("Production Readiness — Credential Normalization & Academic Data Safety", () => {
  it("normalizes credentials deterministically across encountered degree levels", () => {
    expect(normalizeDegreeLevel("Bachelor of Science")).toBe("BS");
    expect(normalizeDegreeLevel("Bachelor of Arts in Psychology")).toBe("BA");
    expect(normalizeDegreeLevel("Associate of Science")).toBe("AS");
    expect(normalizeDegreeLevel("Associate of Arts")).toBe("AA");
    expect(normalizeDegreeLevel("Master of Science in Information Technology")).toBe("MS");
    expect(normalizeDegreeLevel("Master of Arts")).toBe("MA");
    expect(normalizeDegreeLevel("Master of Business Administration (MBA)")).toBe("MBA");
    expect(normalizeDegreeLevel("Bachelor of Science in Nursing (RN to BSN)")).toBe("RN to BSN");
    expect(normalizeDegreeLevel("Graduate Certificate in Data Analytics")).toBe("Graduate Certificate");
    expect(normalizeDegreeLevel("Undergraduate Certificate in Coding")).toBe("Undergraduate Certificate");
    expect(normalizeDegreeLevel("Custom Certification Program")).toBe("Other");
    expect(normalizeDegreeLevel("Diploma of Advanced Studies")).toBe("Other");
  });

  it("distinguishes known credit total from partial sums with unknown components", () => {
    const completeGroup: RequirementGroupDomain = {
      stableSourcePath: "root.group[0]",
      title: "Core Courses",
      category: "core",
      ruleType: "all_of",
      children: [],
      courseRequirements: [
        { courseCode: "CS 110", title: "Intro", credits: 3, sourcePath: "c1" },
        { courseCode: "CS 120", title: "Data Struct", credits: 3, sourcePath: "c2" },
      ],
      textRequirements: [],
    };

    expect(calculateKnownCreditSummary([completeGroup])).toBe(6);

    const unknownGroup: RequirementGroupDomain = {
      stableSourcePath: "root.group[1]",
      title: "Elective Courses",
      category: "elective",
      ruleType: "choose_n",
      children: [],
      courseRequirements: [
        { courseCode: "CS 299", title: "Special Topic", credits: null, sourcePath: "c3" },
      ],
      textRequirements: [],
    };

    expect(calculateKnownCreditSummary([unknownGroup])).toBeNull();
    expect(calculateKnownCreditSummary([completeGroup, unknownGroup])).toBeNull();
  });
});

describe("Production Readiness — Fixture Isolation Gate", { timeout: 15000 }, () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = originalEnv;
  });

  it("rejects fixture snapshots in production without an explicit non-production opt-in", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ALLOW_FIXTURE_SNAPSHOTS;
    vi.doMock("@/data/snapshots/manifest.json", async (importOriginal) => {
      const orig = await importOriginal<Record<string, unknown>>();
      return { default: { ...(orig.default as Record<string, unknown>), fixture: true } };
    });

    const { getPrograms } = await import("@/lib/serverData");
    const { resetStaticSnapshotValidationForTests } = await import("@/lib/staticSnapshots");
    resetStaticSnapshotValidationForTests();

    await expect(getPrograms()).rejects.toThrow(/Fixture static snapshots are forbidden/);
  });

  it("never permits fixture snapshots in Vercel production, even with an opt-in", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    process.env.ALLOW_FIXTURE_SNAPSHOTS = "true";
    vi.doMock("@/data/snapshots/manifest.json", async (importOriginal) => {
      const orig = await importOriginal<Record<string, unknown>>();
      return { default: { ...(orig.default as Record<string, unknown>), fixture: true } };
    });

    const { getPrograms } = await import("@/lib/serverData");
    const { resetStaticSnapshotValidationForTests } = await import("@/lib/staticSnapshots");
    resetStaticSnapshotValidationForTests();
    await expect(getPrograms()).rejects.toThrow(/forbidden in Vercel production/);
  });

  it("allows fixture access in non-production when ALLOW_FIXTURE_SNAPSHOTS is true", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "development");
    process.env.ALLOW_FIXTURE_SNAPSHOTS = "true";
    vi.doMock("@/data/snapshots/manifest.json", async (importOriginal) => {
      const orig = await importOriginal<Record<string, unknown>>();
      return { default: { ...(orig.default as Record<string, unknown>), fixture: true } };
    });

    const { getProgramBySlug } = await import("@/lib/serverData");
    const program = await getProgramBySlug("computer-science-bs");
    expect(program).not.toBeNull();
    expect(program?.title).toContain("Computer Science");
  });

  it("rejects fixture data in preview unless explicitly opted in", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    delete process.env.ALLOW_FIXTURE_SNAPSHOTS;
    vi.doMock("@/data/snapshots/manifest.json", async (importOriginal) => {
      const orig = await importOriginal<Record<string, unknown>>();
      return { default: { ...(orig.default as Record<string, unknown>), fixture: true } };
    });

    const { getPrograms } = await import("@/lib/serverData");
    const { resetStaticSnapshotValidationForTests } = await import("@/lib/staticSnapshots");
    resetStaticSnapshotValidationForTests();

    await expect(getPrograms()).rejects.toThrow(/Fixture static snapshots are forbidden/);
  });

  it("permits non-fixture snapshots in production without requiring ALLOW_FIXTURE_SNAPSHOTS", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ALLOW_FIXTURE_SNAPSHOTS;
    vi.doMock("@/data/snapshots/manifest.json", async (importOriginal) => {
      const orig = await importOriginal<Record<string, unknown>>();
      return { default: { ...(orig.default as Record<string, unknown>), fixture: false } };
    });

    const { getPrograms } = await import("@/lib/serverData");
    const { resetStaticSnapshotValidationForTests } = await import("@/lib/staticSnapshots");
    resetStaticSnapshotValidationForTests();

    const programs = await getPrograms();
    expect(programs.length).toBeGreaterThan(0);
  });
});
