import { describe, expect, it } from "vitest";
import { parseCourse } from "@/features/courses/sync/parse";
import { parseExperienceDetail } from "@/features/transfers/sync/parse";

describe("ported write-sync parsers", () => {
  it("parses a Courses record without a database boundary", () => {
    const result = parseCourse({ pid: "course-pid", id: "CS210", title: "Software Development", credits: { value: 3 } });
    expect(result.pid).toBe("course-pid");
    expect(result.credits).toBe(3);
  });

  it("deduplicates Transfer course links from one experience", () => {
    const result = parseExperienceDetail({
      pid: "experience-pid",
      rulesAchievementCriteria: '<a href="#/courses/view/x" target="_blank">CS210</a><a href="#/courses/view/y" target="_blank">CS210</a>',
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.courseNumber).toBe("CS210");
  });
});
