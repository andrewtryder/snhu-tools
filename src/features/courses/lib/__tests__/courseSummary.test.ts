import { describe, expect, it } from "vitest";
import { buildCourseSummary } from "../courseSummary";

describe("buildCourseSummary", () => {
  it("formats zero prerequisites correctly", () => {
    const summary = buildCourseSummary({
      courseId: "CS110",
      directPrerequisiteCount: 0,
      totalPrerequisiteCount: 0,
      dependentCount: 0,
    });
    expect(summary).toBe("SNHU CS110 has no listed prerequisites.");
  });

  it("formats single direct prerequisite and zero dependents", () => {
    const summary = buildCourseSummary({
      courseId: "CS210",
      directPrerequisiteCount: 1,
      totalPrerequisiteCount: 1,
      dependentCount: 0,
    });
    expect(summary).toBe("SNHU CS210 has 1 direct prerequisite.");
  });

  it("formats multiple direct prerequisites and deeper tree", () => {
    const summary = buildCourseSummary({
      courseId: "CS330",
      directPrerequisiteCount: 2,
      totalPrerequisiteCount: 5,
      dependentCount: 3,
    });
    expect(summary).toBe(
      "SNHU CS330 has 2 direct prerequisites, with 5 courses in its complete prerequisite tree, and is required by 3 other courses.",
    );
  });

  it("formats course with no prerequisites but multiple dependents", () => {
    const summary = buildCourseSummary({
      courseId: "IT140",
      directPrerequisiteCount: 0,
      totalPrerequisiteCount: 0,
      dependentCount: 4,
    });
    expect(summary).toBe(
      "SNHU IT140 has no listed prerequisites and is required by 4 other courses.",
    );
  });
});
