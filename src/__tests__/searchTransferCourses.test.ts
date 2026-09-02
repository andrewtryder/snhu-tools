import { describe, it, expect, vi } from "vitest";
import { searchTransferCourses } from "@/features/transfers/lib/searchTransferCourses";

vi.mock("@/features/transfers/db", () => {
  const mockRows = [
    { courseNumber: "CS210", optionCount: 2 },
    { courseNumber: "ACC201", optionCount: 13 },
    { courseNumber: "IT140", optionCount: 5 },
  ];

  return {
    db: {
      execute: vi.fn(async (sqlObj) => {
        const queryParams = sqlObj.queryChunks
          ? sqlObj.queryChunks.filter((c: unknown) => typeof c === "string" || typeof c === "number")
          : [];

        const contains = String(queryParams[0] || "").replace(/%/g, "").toUpperCase();
        const normalizedContains = String(queryParams[1] || "").replace(/%/g, "").toUpperCase();
        const normalizedQuery = String(queryParams[3] || "").toUpperCase();
        const limit = Number(queryParams[queryParams.length - 1]) || 10;

        const filtered = mockRows.filter(
          (r) =>
            r.courseNumber.toUpperCase().includes(contains) ||
            r.courseNumber.toUpperCase().includes(normalizedContains)
        );

        filtered.sort((a, b) => {
          const score = (r: typeof a) => {
            if (r.courseNumber.toUpperCase() === normalizedQuery) return 1;
            if (r.courseNumber.toUpperCase().startsWith(contains)) return 2;
            return 3;
          };
          return score(a) - score(b);
        });

        return filtered.slice(0, limit);
      }),
    },
  };
});

describe("searchTransferCourses", () => {
  it("returns empty array for empty query", async () => {
    const res = await searchTransferCourses("");
    expect(res).toEqual([]);
  });

  it("collapses multiple transfer options into a single SNHU course result with optionCount", async () => {
    const res = await searchTransferCourses("ACC201");
    expect(res.length).toBe(1);
    expect(res[0].courseNumber).toBe("ACC201");
    expect(res[0].optionCount).toBe(13);
  });

  it("finds transfer options with spaced or hyphenated course code", async () => {
    const res = await searchTransferCourses("CS 210");
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].courseNumber).toBe("CS210");
    expect(res[0].optionCount).toBe(2);
  });

  it("respects limit option", async () => {
    const res = await searchTransferCourses("C", { limit: 1 });
    expect(res.length).toBe(1);
  });
});
