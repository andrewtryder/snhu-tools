import { describe, expect, it } from "vitest";
import { searchCourses } from "@/features/courses/lib/searchCourses";
import { coursePath } from "@/features/courses/lib/courseIds";

describe("searchCourses static snapshot contract", () => {
  it("returns empty results for blank input", async () => expect(await searchCourses("  ")).toEqual([]));
  it("normalizes spaced and hyphenated course IDs without changing canonical URLs", async () => {
    for (const query of ["CS210", "cs210", "CS 210", "CS-210"]) {
      const result = await searchCourses(query);
      expect(result[0]).toMatchObject({ catalog_course_id: "CS210", title: "Programming Languages" });
      expect(coursePath(result[0].catalog_course_id)).toBe("/courses/CS210");
    }
  });
  it("matches titles and applies limits", async () => {
    expect((await searchCourses("scripting"))[0]?.catalog_course_id).toBe("IT140");
    expect(await searchCourses("", { limit: 1 })).toEqual([]);
    expect((await searchCourses("", { limit: 1 })).length).toBeLessThanOrEqual(1);
  });
});
