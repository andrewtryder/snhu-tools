import { describe, expect, it } from "vitest";
import { buildTreesFromGraph, getAllCourseIds, getCourseDetailPageData, getCourseTrees } from "../courses";

describe("static course catalog", () => {
  it("preserves prerequisite tree shape and cuts cycles", () => {
    const trees = buildTreesFromGraph(["A"], new Map([["A", "Alpha"]]), [{ parentId: "A", parentTitle: "Alpha", childId: "B", childTitle: "Beta" }, { parentId: "B", parentTitle: "Beta", childId: "A", childTitle: "Alpha" }]);
    expect(trees[0].tree).toEqual({ course_id: "A", name: "Alpha", prerequisites: [{ course_id: "B", name: "Beta" }] });
  });

  it("serves records, prerequisite relationships, and missing IDs solely from the snapshot", async () => {
    expect(await getAllCourseIds()).toContain("PSY321");
    const detail = await getCourseDetailPageData("PSY321");
    expect(detail.course?.catalog_course_id).toBe("PSY321");
    expect(detail.tree).toEqual({ course_id: "PSY321", name: "Research Methods in Psychology II", prerequisites: [{ course_id: "PSY222", name: "Research Methods in Psychology I" }] });
    expect(detail.directPrereqs).toEqual(["PSY222"]);
    expect((await getCourseTrees(["PSY321", "NOPE999"]))[1].tree).toBeNull();
  });
});
