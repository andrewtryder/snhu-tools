import { beforeEach, describe, it, expect, vi } from "vitest";

const { withPoolClientMock, persistentCache, unstableCache } = vi.hoisted(() => {
  const entries = new Map<string, Promise<unknown>>();
  return {
    withPoolClientMock: vi.fn(),
    persistentCache: {
      clear: () => entries.clear(),
    },
    unstableCache: vi.fn((fn: (...args: never[]) => unknown, keyParts: string[]) =>
      async (...args: never[]) => {
        const key = JSON.stringify([keyParts, args]);
        const cached = entries.get(key);
        if (cached) return cached;

        const result = Promise.resolve(fn(...args));
        entries.set(key, result);
        try {
          return await result;
        } catch (error) {
          entries.delete(key);
          throw error;
        }
      },
    ),
  };
});

vi.mock("@/features/courses/db/pool", () => ({ withPoolClient: withPoolClientMock }));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("next/cache", () => ({
  unstable_cache: unstableCache,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import {
  buildTreesFromGraph,
  getAllCourseIds,
  getCourseById,
  getCourseTrees,
} from "../courses";
import type { CourseTree } from "../courseGraphLayout";

function treeOf(course_id: string, name: string, prereqs?: CourseTree[]): CourseTree {
  const t: CourseTree = { course_id, name };
  if (prereqs && prereqs.length > 0) t.prerequisites = prereqs;
  return t;
}

function dbClient(overrides: Record<string, unknown> = {}) {
  return {
    query: vi.fn(),
    sql: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  persistentCache.clear();
  withPoolClientMock.mockReset();
});

describe("buildTreesFromGraph", () => {
  it("returns a leaf tree when a course has no prerequisites", () => {
    const rootTitles = new Map([["CS101", "Intro to Computer Science"]]);
    const results = buildTreesFromGraph(["CS101"], rootTitles, []);

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("CS101");
    expect(results[0]?.tree).toEqual(treeOf("CS101", "Intro to Computer Science"));
    expect(results[0]?.tree?.prerequisites).toBeUndefined();
  });

  it("builds a linear chain A → B → C correctly", () => {
    const rootTitles = new Map([["CS300", "Advanced Topics"]]);
    const edges = [
      { parentId: "CS300", parentTitle: "Advanced Topics", childId: "CS200", childTitle: "Intermediate" },
      { parentId: "CS200", parentTitle: "Intermediate", childId: "CS100", childTitle: "Basics" },
    ];
    const results = buildTreesFromGraph(["CS300"], rootTitles, edges);

    expect(results[0]?.tree).toEqual(
      treeOf("CS300", "Advanced Topics", [
        treeOf("CS200", "Intermediate", [
          treeOf("CS100", "Basics"),
        ]),
      ]),
    );
  });

  it("builds a branching tree (multiple prerequisites for one parent)", () => {
    const rootTitles = new Map([["CS400", "Capstone"]]);
    const edges = [
      { parentId: "CS400", parentTitle: "Capstone", childId: "CS310", childTitle: "Software Eng" },
      { parentId: "CS400", parentTitle: "Capstone", childId: "MATH240", childTitle: "Statistics" },
    ];
    const results = buildTreesFromGraph(["CS400"], rootTitles, edges);

    expect(results[0]?.tree).toEqual(
      treeOf("CS400", "Capstone", [
        treeOf("CS310", "Software Eng"),
        treeOf("MATH240", "Statistics"),
      ]),
    );
  });

  it("preserves shared diamond prerequisites on independent branches", () => {
    // CS400 requires CS310 and CS320; both independently require CS100
    const rootTitles = new Map([["CS400", "Capstone"]]);
    const edges = [
      { parentId: "CS400", parentTitle: "Capstone", childId: "CS310", childTitle: "Track A" },
      { parentId: "CS400", parentTitle: "Capstone", childId: "CS320", childTitle: "Track B" },
      { parentId: "CS310", parentTitle: "Track A", childId: "CS100", childTitle: "Basics" },
      { parentId: "CS320", parentTitle: "Track B", childId: "CS100", childTitle: "Basics" },
    ];
    const results = buildTreesFromGraph(["CS400"], rootTitles, edges);

    expect(results[0]?.tree).toEqual(
      treeOf("CS400", "Capstone", [
        treeOf("CS310", "Track A", [treeOf("CS100", "Basics")]),
        treeOf("CS320", "Track B", [treeOf("CS100", "Basics")]),
      ]),
    );
  });

  it("cuts a direct 2-node cycle A ↔ B without infinite recursion", () => {
    const rootTitles = new Map([["CS1", "Course One"]]);
    const edges = [
      { parentId: "CS1", parentTitle: "Course One", childId: "CS2", childTitle: "Course Two" },
      { parentId: "CS2", parentTitle: "Course Two", childId: "CS1", childTitle: "Course One" },
    ];
    const results = buildTreesFromGraph(["CS1"], rootTitles, edges);

    expect(results[0]?.tree).toEqual(
      treeOf("CS1", "Course One", [
        treeOf("CS2", "Course Two"),
      ]),
    );
  });

  it("handles multiple roots independently in a single batch", () => {
    const rootTitles = new Map([
      ["CS300", "Advanced"],
      ["IT200", "Networking"],
    ]);
    const edges = [
      { parentId: "CS300", parentTitle: "Advanced", childId: "CS100", childTitle: "Basics" },
      { parentId: "IT200", parentTitle: "Networking", childId: "IT100", childTitle: "IT Basics" },
    ];
    const results = buildTreesFromGraph(["CS300", "IT200"], rootTitles, edges);

    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe("CS300");
    expect(results[0]?.tree).toEqual(
      treeOf("CS300", "Advanced", [treeOf("CS100", "Basics")]),
    );
    expect(results[1]?.id).toBe("IT200");
    expect(results[1]?.tree).toEqual(
      treeOf("IT200", "Networking", [treeOf("IT100", "IT Basics")]),
    );
  });

  it("returns null tree for roots not found in rootTitles", () => {
    const rootTitles = new Map([["CS100", "Basics"]]);
    const results = buildTreesFromGraph(["CS100", "UNKNOWN999"], rootTitles, []);

    expect(results).toHaveLength(2);
    expect(results[0]?.tree).toEqual(treeOf("CS100", "Basics"));
    expect(results[1]?.id).toBe("UNKNOWN999");
    expect(results[1]?.tree).toBeNull();
  });
});

describe("getCourseById", () => {
  it("fetches and caches course record by ID", async () => {
    const mockRecord = {
      title: "Computer Science I",
      pid: "12345",
      catalog_course_id: "CS110",
      description: "Introductory course",
      academic_level: "Undergraduate",
      credits: "3",
      subject_code: "CS",
    };

    const client = dbClient({
      query: vi.fn().mockResolvedValueOnce({ rows: [mockRecord] }),
    });
    withPoolClientMock.mockImplementationOnce((fn: (c: unknown) => unknown) => fn(client));

    const result = await getCourseById("cs110");
    expect(result).toEqual(mockRecord);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT title, pid, catalog_course_id"),
      ["CS110"],
    );
  });
});

describe("getCourseTrees", () => {
  it("fetches and caches multiple trees in order", async () => {
    const client = dbClient({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            { catalog_course_id: "CS110", title: "Intro to CS" },
            { catalog_course_id: "IT140", title: "Intro to Scripting" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [],
        }),
    });
    withPoolClientMock.mockImplementationOnce((fn: (c: unknown) => unknown) => fn(client));

    const results = await getCourseTrees(["CS110", "IT140"]);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("CS110");
    expect(results[0].tree?.name).toBe("Intro to CS");
    expect(results[1].id).toBe("IT140");
    expect(results[1].tree?.name).toBe("Intro to Scripting");
  });
});

describe("getAllCourseIds", () => {
  it("gracefully returns empty array if database is not available", async () => {
    withPoolClientMock.mockRejectedValueOnce(new Error("Database offline"));

    const result = await getAllCourseIds();
    expect(result).toEqual([]);
  });
});
