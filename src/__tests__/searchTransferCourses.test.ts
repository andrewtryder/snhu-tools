import { describe, it, expect } from "vitest";
import { searchTransferCourses } from "@/features/transfers/lib/searchTransferCourses";

describe("searchTransferCourses", () => {
  it("returns empty array for empty query", async () => {
    const res = await searchTransferCourses("");
    expect(res).toEqual([]);
  });

  it("collapses multiple transfer options into a single SNHU course result with optionCount", async () => {
    const res = await searchTransferCourses("ACC201");
    expect(res.length).toBeGreaterThanOrEqual(1);
    const acc201 = res.find((r) => r.courseNumber === "ACC201");
    expect(acc201).toBeDefined();
    expect(acc201!.optionCount).toBeGreaterThanOrEqual(13);
  });

  it("finds transfer options with spaced or hyphenated course code", async () => {
    const res = await searchTransferCourses("CS 210");
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].courseNumber).toBe("CS210");
    expect(res[0].optionCount).toBeGreaterThanOrEqual(2);
  });

  it("respects limit option", async () => {
    const res = await searchTransferCourses("C", { limit: 1 });
    expect(res.length).toBe(1);
  });
});
