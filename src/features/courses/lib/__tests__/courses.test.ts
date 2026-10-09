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
    expect(detail.tree?.course_id).toBe("PSY321");
    expect(typeof detail.tree?.name).toBe("string");
    expect(detail.tree?.name).toBeTruthy();
    expect(detail.directPrereqs).toContain("PSY222");
    expect(detail.tree?.prerequisites && detail.tree.prerequisites.length > 0).toBe(true);
    expect((await getCourseTrees(["PSY321", "NOPE999"]))[0].tree?.course_id).toBe("PSY321");
    expect((await getCourseTrees(["PSY321", "NOPE999"]))[1].tree).toBeNull();
  });
});
