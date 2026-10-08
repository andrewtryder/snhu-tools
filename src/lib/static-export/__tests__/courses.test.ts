import { describe, expect, it, vi } from "vitest";
import { CourseExportValidationError, exportCoursesFromDatabase, transformCourses, validateCourseGraph } from "../courses";

const rows = [
  { catalog_course_id: " cs-210 ", title: "Programming", pid: "1", description: "d", academic_level: "Undergraduate", credits: "3", subject_code: "CS" },
  { catalog_course_id: "CS210", title: "Programming", pid: "1", description: "d", academic_level: "Undergraduate", credits: "3", subject_code: "CS" },
  { catalog_course_id: "IT140", title: "Scripting", pid: "2", description: null, academic_level: null, credits: null, subject_code: "IT" },
];
const edges = [
  { parent_id: "CS210", parent_title: "Programming", child_id: "IT140", child_title: "Scripting" },
  { parent_id: "CS210", parent_title: "Programming", child_id: "EXT100", child_title: "External prerequisite" },
  { parent_id: "CS210", parent_title: "Programming", child_id: "IT140", child_title: "Scripting" },
];

describe("course static exporter", () => {
  it("reconciles exact duplicates, preserves external prerequisites, and is deterministic", () => {
    const value = transformCourses([...rows].reverse(), [...edges].reverse(), "2026-01-01T00:00:00Z");
    expect(value.ids).toEqual(["CS210", "IT140"]);
    expect(value.edges.map((edge) => edge.childId)).toEqual(["EXT100", "IT140"]);
    expect(value.reconciliation).toEqual({ records: { sourceRows: 3, exportedRecords: 2, duplicateRows: 1, rejectedRows: 0 }, prerequisiteEdges: { sourceRows: 3, exportedEdges: 2, duplicateRows: 1, rejectedRows: 0, externalReferences: 1 } });
    expect(validateCourseGraph(value)[0].tree?.course_id).toBe("CS210");
    expect(transformCourses(rows, edges, "2026-01-01T00:00:00Z")).toEqual(value);
  });

  it("fails with an auditable report instead of silently losing malformed records or relationships", () => {
    const malformed = [...rows, { catalog_course_id: "", title: "bad" }];
    expect(() => transformCourses(malformed, edges, null)).toThrow(CourseExportValidationError);
    try { transformCourses(malformed, edges, null); } catch (error) { const failure = error as CourseExportValidationError; expect(failure.reconciliation.records).toMatchObject({ sourceRows: 4, rejectedRows: 1 }); expect(failure.issues).toContainEqual(expect.objectContaining({ kind: "record", reason: "missing-catalog-course-id" })); }
    const conflicting = [{ ...rows[0] }, { ...rows[0], title: "Different title" }];
    expect(() => transformCourses(conflicting, [], null)).toThrow(/conflicting-duplicate-identifier/);
    expect(() => transformCourses([{ catalog_course_id: "CS210", title: "Missing PID" }], [], null)).toThrow(/missing-pid/);
    expect(() => transformCourses(rows, [{ ...edges[0], parent_id: "UNKNOWN" }], null)).toThrow(/unknown-parent-course/);
    expect(() => transformCourses(rows, [{ ...edges[0], child_id: "CS210", child_title: "Programming" }], null)).toThrow(/self-reference/);
  });

  it("uses a repeatable-read transaction and ordered source queries", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: edges })
      .mockResolvedValueOnce({ rows: [{ completed_at: "2026-01-01T00:00:00Z" }] })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const result = await exportCoursesFromDatabase({ connect: vi.fn().mockResolvedValue({ query, release }) } as never);
    expect(result.meta.counts).toEqual({ ids: 2, records: 2, edges: 2 });
    expect(query).toHaveBeenCalledWith("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(query.mock.calls[1][0]).toContain("ORDER BY catalog_course_id, pid");
    expect(query.mock.calls[2][0]).toContain("ORDER BY parent.catalog_course_id, prerequisite.catalog_course_id, parent.pid, prerequisite.pid");
    expect(release).toHaveBeenCalled();
  });

  it("rolls back and releases the bounded client on a reconciliation failure", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ catalog_course_id: "CS210", title: "One" }, { catalog_course_id: "CS210", title: "Two" }] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ completed_at: "2026-01-01T00:00:00Z" }] }).mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    await expect(exportCoursesFromDatabase({ connect: vi.fn().mockResolvedValue({ query, release }) } as never)).rejects.toThrow(/conflicting/);
    expect(query).toHaveBeenCalledWith("ROLLBACK"); expect(release).toHaveBeenCalled();
  });
});
