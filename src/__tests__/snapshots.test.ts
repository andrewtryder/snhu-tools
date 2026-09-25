import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

import {
  classifyDbAvailabilityError,
  isDbAvailabilityError,
} from "@/lib/snapshots/availability";
import {
  createFsSnapshotStore,
  setSnapshotStoreForTests,
} from "@/lib/snapshots/store";
import {
  publishDomainSnapshot,
  readCurrentManifest,
  readPreviousManifest,
  rollbackToPreviousManifest,
} from "@/lib/snapshots/manifest";
import { readThroughSnapshot } from "@/lib/snapshots/readThrough";
import { createSnapshotVersion } from "@/lib/snapshots/paths";
import type { SnapshotMeta } from "@/lib/snapshots/types";
import { CATALOG_REVALIDATE, CATALOG_TTL } from "@/features/courses/lib/courses";
import { TRANSFER_CACHE_REVALIDATE } from "@/features/transfers/lib/constants";
import {
  buildSearchIndexFromBundles,
  validateSearchBundle,
} from "@/lib/snapshots/domains/search";

describe("classifyDbAvailabilityError", () => {
  it("classifies postgres 53000", () => {
    const result = classifyDbAvailabilityError({ code: "53000", message: "insufficient resources" });
    expect(result?.reason).toBe("postgres-53000");
    expect(isDbAvailabilityError({ code: "53000" })).toBe(true);
  });

  it("classifies connection terminated messages", () => {
    const result = classifyDbAvailabilityError(
      new Error("Connection terminated unexpectedly"),
    );
    expect(result?.isAvailability).toBe(true);
  });

  it("classifies timeouts", () => {
    expect(classifyDbAvailabilityError({ code: "ETIMEDOUT" })?.reason).toBe("timeout");
    expect(
      classifyDbAvailabilityError(new Error("timeout expired"))?.reason,
    ).toBe("timeout");
  });

  it("does not classify programmer/schema errors", () => {
    expect(classifyDbAvailabilityError({ code: "42P01", message: "undefined_table" })).toBeNull();
    expect(classifyDbAvailabilityError(new Error("column foo does not exist"))).toBeNull();
    expect(isDbAvailabilityError(new Error("syntax error at or near"))).toBe(false);
  });
});

describe("course/transfer revalidate constants", () => {
  it("uses event-driven false revalidate (not 86400)", () => {
    expect(CATALOG_REVALIDATE).toBe(false);
    expect(CATALOG_TTL).toBe(false);
    expect(CATALOG_REVALIDATE).not.toBe(86_400);
  });

  it("uses event-driven transfer revalidate false (not 7-day TTL)", () => {
    expect(TRANSFER_CACHE_REVALIDATE).toBe(false);
    expect(TRANSFER_CACHE_REVALIDATE).not.toBe(7 * 24 * 60 * 60);
  });
});

describe("snapshot publish / readThrough / rollback", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "snhu-snapshots-"));
    setSnapshotStoreForTests(createFsSnapshotStore(tempDir));
  });

  afterEach(async () => {
    setSnapshotStoreForTests(null);
    await rm(tempDir, { recursive: true, force: true });
  });

  function coursesMeta(version: string): SnapshotMeta {
    return {
      domain: "courses",
      version,
      publishedAt: new Date().toISOString(),
      sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
      counts: { summaries: 1 },
    };
  }

  it("publish success updates manifest", async () => {
    const version = createSnapshotVersion("courses");
    const bundle = {
      meta: coursesMeta(version),
      summaries: [{ catalog_course_id: "CS101", title: "Intro" }],
      ids: ["CS101"],
      records: {},
      edges: [],
      trees: {},
      dependents: {},
      directPrereqs: {},
      lastModified: "2026-01-01T00:00:00.000Z",
    };

    const { manifest } = await publishDomainSnapshot({
      domain: "courses",
      bundle,
      validate: (b) => {
        if (!b.summaries?.length) throw new Error("empty");
      },
      sourceUpdatedAt: bundle.lastModified,
      counts: { courses: 1 },
    });

    expect(manifest.coursesVersion).toBe(version);
    expect(manifest.counts.courses).toBe(1);
    const current = await readCurrentManifest();
    expect(current?.coursesVersion).toBe(version);
  });

  it("failed validate leaves previous manifest untouched", async () => {
    const version1 = createSnapshotVersion("courses");
    await publishDomainSnapshot({
      domain: "courses",
      bundle: {
        meta: coursesMeta(version1),
        summaries: [{ catalog_course_id: "CS101", title: "Intro" }],
      },
      validate: (b: { summaries: unknown[] }) => {
        if (!b.summaries?.length) throw new Error("empty");
      },
      counts: { courses: 1 },
    });

    const before = await readCurrentManifest();
    await expect(
      publishDomainSnapshot({
        domain: "courses",
        bundle: {
          meta: coursesMeta(createSnapshotVersion("courses")),
          summaries: [],
        },
        validate: (b: { summaries: unknown[] }) => {
          if (!b.summaries?.length) throw new Error("empty bundle refused");
        },
      }),
    ).rejects.toThrow(/empty bundle refused/);

    const after = await readCurrentManifest();
    expect(after?.coursesVersion).toBe(before?.coursesVersion);
  });

  it("empty search bundle is refused by validateSearchBundle", () => {
    expect(() =>
      validateSearchBundle({
        meta: {
          domain: "search",
          version: "search-test",
          publishedAt: new Date().toISOString(),
          sourceUpdatedAt: null,
          counts: {},
        },
        builtFrom: { programs: null, courses: null, transfers: null },
        programs: [],
        courses: [],
        transfers: [],
      }),
    ).toThrow(/at least one domain/);
  });

  it("detects search builtFrom mismatch against manifest domain versions", async () => {
    const { assertSearchBuiltFromMatchesManifest } = await import("@/lib/snapshots/domains/search");
    expect(() =>
      assertSearchBuiltFromMatchesManifest(
        {
          meta: {
            domain: "search",
            version: "search-old",
            publishedAt: new Date().toISOString(),
            sourceUpdatedAt: null,
            counts: { searchEntries: 1 },
          },
          builtFrom: {
            programs: "programs-v1",
            courses: "courses-v1",
            transfers: "transfers-v1",
          },
          programs: [{ slug: "x", title: "X", credential: "BS", degreeLevel: "undergraduate" }],
          courses: [],
          transfers: [],
        },
        {
          programsVersion: "programs-v2",
          coursesVersion: "courses-v1",
          transfersVersion: "transfers-v1",
        },
      ),
    ).toThrow(/builtFrom\.programs/);
  });

  it("readThrough falls back to snapshot on 53000", async () => {
    const version = createSnapshotVersion("courses");
    await publishDomainSnapshot({
      domain: "courses",
      bundle: {
        meta: coursesMeta(version),
        summaries: [{ catalog_course_id: "CS210", title: "Programming" }],
        ids: ["CS210"],
      },
      validate: (b: { summaries: unknown[] }) => {
        if (!b.summaries?.length) throw new Error("empty");
      },
      counts: { courses: 1 },
    });

    const loadFromDatabase = vi.fn(async () => {
      const err = new Error(" Neon exceeded the quota ") as Error & { code: string };
      err.code = "53000";
      throw err;
    });

    const result = await readThroughSnapshot({
      domain: "courses",
      cacheKey: "courses.test",
      preferSnapshot: false, // force DB attempt so outage path is exercised
      loadFromDatabase,
      fromBundle: (b) => (b as { summaries: { catalog_course_id: string }[] }).summaries,
      validate: (v) => Array.isArray(v) && v.length > 0,
    });

    expect(loadFromDatabase).toHaveBeenCalled();
    expect(result.source).toBe("snapshot");
    expect(result.value?.[0]?.catalog_course_id).toBe("CS210");
  });

  it("preferSnapshot serves durable data without calling DB", async () => {
    const version = createSnapshotVersion("courses");
    await publishDomainSnapshot({
      domain: "courses",
      bundle: {
        meta: coursesMeta(version),
        summaries: [{ catalog_course_id: "ACC201", title: "Accounting" }],
      },
      validate: (b: { summaries: unknown[] }) => {
        if (!b.summaries?.length) throw new Error("empty");
      },
    });

    const loadFromDatabase = vi.fn(async () => {
      throw new Error("should not hit DB");
    });

    const result = await readThroughSnapshot({
      domain: "courses",
      cacheKey: "courses.prefer",
      preferSnapshot: true,
      loadFromDatabase,
      fromBundle: (b) => (b as { summaries: unknown[] }).summaries,
      validate: (v) => Array.isArray(v) && v.length > 0,
    });

    expect(loadFromDatabase).not.toHaveBeenCalled();
    expect(result.source).toBe("snapshot");
  });

  it("rollback restores previous manifest", async () => {
    const v1 = createSnapshotVersion("courses");
    await publishDomainSnapshot({
      domain: "courses",
      bundle: {
        meta: coursesMeta(v1),
        summaries: [{ catalog_course_id: "A", title: "A" }],
      },
      validate: (b: { summaries: unknown[] }) => {
        if (!b.summaries?.length) throw new Error("empty");
      },
      counts: { courses: 1 },
    });

    // Ensure distinct version ids
    await new Promise((r) => setTimeout(r, 5));
    const v2 = createSnapshotVersion("courses");
    await publishDomainSnapshot({
      domain: "courses",
      bundle: {
        meta: coursesMeta(v2),
        summaries: [
          { catalog_course_id: "A", title: "A" },
          { catalog_course_id: "B", title: "B" },
        ],
      },
      validate: (b: { summaries: unknown[] }) => {
        if (!b.summaries?.length) throw new Error("empty");
      },
      counts: { courses: 2 },
    });

    expect((await readCurrentManifest())?.coursesVersion).toBe(v2);
    expect((await readPreviousManifest())?.coursesVersion).toBe(v1);

    const rolled = await rollbackToPreviousManifest();
    expect(rolled.coursesVersion).toBe(v1);
    expect((await readCurrentManifest())?.coursesVersion).toBe(v1);
  });

  it("search index ranks from published bundles without DB", () => {
    const index = buildSearchIndexFromBundles({
      programs: {
        directory: [
          {
            slug: "bs-cs",
            title: "Computer Science",
            credential: "BS",
            degreeLevel: "undergraduate",
            catalogYear: "2025-2026",
            totalCredits: 120,
            requiredCourseCount: 10,
            description: "",
            sourceCatalogUrl: null,
          },
        ],
      },
      courses: {
        summaries: [{ catalog_course_id: "CS210", title: "Programming Languages" }],
      },
      transfers: {
        rows: [
          {
            subjectPrefix: "CS",
            courseNumber: "CS210",
            title: "Programming",
            pid: null,
            eligibilityTimeframe: null,
            groupFilter2Name: null,
            academicLevel: null,
            coursePID: null,
          },
          {
            subjectPrefix: "CS",
            courseNumber: "CS210",
            title: "Programming",
            pid: null,
            eligibilityTimeframe: null,
            groupFilter2Name: "Other College",
            academicLevel: null,
            coursePID: null,
          },
        ],
      },
    });

    expect(index.courses[0]?.id).toBe("CS210");
    expect(index.programs[0]?.slug).toBe("bs-cs");
    expect(index.transfers).toHaveLength(1);
    validateSearchBundle(index);
  });
});
