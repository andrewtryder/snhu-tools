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
  createFsSnapshotStore,
  setSnapshotStoreForTests,
} from "@/lib/snapshots/store";
import { publishDomainSnapshot } from "@/lib/snapshots/manifest";
import { createSnapshotVersion } from "@/lib/snapshots/paths";
import {
  searchCoursesFromSnapshot,
  searchProgramsFromSnapshot,
  searchTransfersFromSnapshot,
} from "@/lib/search/snapshotSearch";

describe("snapshotSearch without DB", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "snhu-search-snap-"));
    setSnapshotStoreForTests(createFsSnapshotStore(tempDir));

    const version = createSnapshotVersion("search");
    await publishDomainSnapshot({
      domain: "search",
      bundle: {
        meta: {
          domain: "search" as const,
          version,
          publishedAt: new Date().toISOString(),
          sourceUpdatedAt: null,
          counts: { programs: 1, courses: 1, transfers: 2, searchEntries: 4 },
        },
        builtFrom: {
          programs: null,
          courses: null,
          transfers: null,
        },
        programs: [
          {
            slug: "bs-accounting",
            title: "Accounting",
            credential: "Bachelor of Science",
            degreeLevel: "undergraduate",
          },
        ],
        courses: [{ id: "ACC201", title: "Financial Accounting" }],
        transfers: [
          { courseNumber: "ACC201", title: "Financial Accounting", subjectPrefix: "ACC" },
          { courseNumber: "ACC201", title: "Financial Accounting", subjectPrefix: "ACC" },
          { courseNumber: "CS210", title: "Programming", subjectPrefix: "CS" },
        ],
      },
      validate: (b) => {
        const total = b.programs.length + b.courses.length + b.transfers.length;
        if (total === 0) throw new Error("empty");
      },
      counts: { searchEntries: 4 },
    });
  });

  afterEach(async () => {
    setSnapshotStoreForTests(null);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("searches courses from index without DB", async () => {
    const results = await searchCoursesFromSnapshot("acc", { limit: 5 });
    expect(results).not.toBeNull();
    expect(results?.[0]?.catalog_course_id).toBe("ACC201");
  });

  it("searches programs from index without DB", async () => {
    const results = await searchProgramsFromSnapshot("account", { limit: 5 });
    expect(results).not.toBeNull();
    expect(results?.[0]?.slug).toBe("bs-accounting");
  });

  it("searches transfers from index and aggregates option counts", async () => {
    const results = await searchTransfersFromSnapshot("ACC201", { limit: 5 });
    expect(results).not.toBeNull();
    const acc = results?.find((r) => r.courseNumber === "ACC201");
    expect(acc?.optionCount).toBe(2);
  });
});
