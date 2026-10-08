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
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("COUNT(*) FILTER (WHERE catalog_course_id IS NOT NULL")) {
        return Promise.resolve({ rows: [{ total_rows: 3, candidate_rows: 3, missing_catalog_course_id: 0 }] });
      }
      if (sql.includes("FROM prerequisites p") && sql.includes("COUNT(*)")) {
        return Promise.resolve({ rows: [{ total_rows: 3, candidate_rows: 3, orphan_class_id: 0, parent_missing_catalog_course_id: 0, missing_prerequisite_course_id: 0, self_reference: 0, external_prerequisites: 1 }] });
      }
      if (sql.includes("FROM courses_data WHERE catalog_course_id IS NOT NULL")) {
        return Promise.resolve({ rows });
      }
      if (sql.includes("FROM prerequisites p") && sql.includes("SELECT")) {
        return Promise.resolve({ rows: edges });
      }
      if (sql.includes("FROM catalog_sync_state")) {
        return Promise.resolve({ rows: [{ completed_at: "2026-01-01T00:00:00Z" }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const release = vi.fn();
    const result = await exportCoursesFromDatabase({ connect: vi.fn().mockResolvedValue({ query, release }) } as never);
    expect(result.meta.counts).toEqual({ ids: 2, records: 2, edges: 2 });
    expect(query).toHaveBeenCalledWith("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(query.mock.calls.some((call) => call[0].includes("ORDER BY catalog_course_id, pid"))).toBe(true);
    expect(query.mock.calls.some((call) => call[0].includes("ORDER BY parent.catalog_course_id, COALESCE(prerequisite.catalog_course_id, p.course_id), parent.pid"))).toBe(true);
    expect(result.reconciliation.sourceCoverage).toBeDefined();
    expect(release).toHaveBeenCalled();
  });

  it("rolls back and releases the bounded client on a reconciliation failure", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("COUNT(*) FILTER (WHERE catalog_course_id IS NOT NULL")) {
        return Promise.resolve({ rows: [{ total_rows: 2, candidate_rows: 2, missing_catalog_course_id: 0 }] });
      }
      if (sql.includes("FROM prerequisites p") && sql.includes("COUNT(*)")) {
        return Promise.resolve({ rows: [{ total_rows: 0, candidate_rows: 0, orphan_class_id: 0, parent_missing_catalog_course_id: 0, missing_prerequisite_course_id: 0, self_reference: 0, external_prerequisites: 0 }] });
      }
      if (sql.includes("FROM courses_data WHERE catalog_course_id IS NOT NULL")) {
        return Promise.resolve({ rows: [{ catalog_course_id: "CS210", title: "One", pid: "1" }, { catalog_course_id: "CS210", title: "Two", pid: "2" }] });
      }
      if (sql.includes("FROM catalog_sync_state")) {
        return Promise.resolve({ rows: [{ completed_at: "2026-01-01T00:00:00Z" }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const release = vi.fn();
    await expect(exportCoursesFromDatabase({ connect: vi.fn().mockResolvedValue({ query, release }) } as never)).rejects.toThrow(/conflicting/);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalled();
  });

  it("accurately describes the complete relevant source population with exclusions and external references", async () => {
    const rawCoursesRows = [
      { catalog_course_id: "CS210", title: "Programming", pid: "1", description: "desc", academic_level: "UG", credits: "3", subject_code: "CS" },
      { catalog_course_id: "CS210", title: "Programming", pid: "1", description: "desc", academic_level: "UG", credits: "3", subject_code: "CS" },
      { catalog_course_id: "IT140", title: "Scripting", pid: "2", description: null, academic_level: "UG", credits: "3", subject_code: "IT" },
      { catalog_course_id: "ENG120", title: "Composition", pid: "3", description: null, academic_level: "UG", credits: "3", subject_code: "ENG" },
    ];
    const rawEdgesRows = [
      { parent_id: "CS210", parent_title: "Programming", child_id: "IT140", child_title: "Scripting" },
      { parent_id: "CS210", parent_title: "Programming", child_id: "IT140", child_title: "Scripting" },
      { parent_id: "CS210", parent_title: "Programming", child_id: "MAT999", child_title: "Calculus Preparation" },
    ];
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("COUNT(*) FILTER (WHERE catalog_course_id IS NOT NULL")) {
        return Promise.resolve({
          rows: [{
            total_rows: 6,
            candidate_rows: 4,
            missing_catalog_course_id: 2,
          }],
        });
      }
      if (sql.includes("FROM prerequisites p") && sql.includes("COUNT(*)")) {
        return Promise.resolve({
          rows: [{
            total_rows: 7,
            candidate_rows: 3,
            orphan_class_id: 1,
            parent_missing_catalog_course_id: 1,
            missing_prerequisite_course_id: 1,
            self_reference: 1,
            external_prerequisites: 1,
          }],
        });
      }
      if (sql.includes("FROM courses_data WHERE catalog_course_id IS NOT NULL")) {
        return Promise.resolve({ rows: rawCoursesRows });
      }
      if (sql.includes("FROM prerequisites p") && sql.includes("SELECT")) {
        return Promise.resolve({ rows: rawEdgesRows });
      }
      if (sql.includes("FROM catalog_sync_state")) {
        return Promise.resolve({ rows: [{ completed_at: "2026-03-01T00:00:00Z" }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const release = vi.fn();
    const result = await exportCoursesFromDatabase({ connect: vi.fn().mockResolvedValue({ query, release }) } as never);

    expect(result.ids).toEqual(["CS210", "ENG120", "IT140"]);
    expect(result.edges).toEqual([
      { parentId: "CS210", parentTitle: "Programming", childId: "IT140", childTitle: "Scripting" },
      { parentId: "CS210", parentTitle: "Programming", childId: "MAT999", childTitle: "Calculus Preparation" },
    ]);
    expect(result.reconciliation.records).toEqual({
      sourceRows: 4,
      exportedRecords: 3,
      duplicateRows: 1,
      rejectedRows: 0,
    });
    expect(result.reconciliation.prerequisiteEdges).toEqual({
      sourceRows: 3,
      exportedEdges: 2,
      duplicateRows: 1,
      rejectedRows: 0,
      externalReferences: 1,
    });
    expect(result.reconciliation.sourceCoverage).toEqual({
      coursesData: {
        totalRows: 6,
        candidateRows: 4,
        excluded: {
          missingCatalogCourseId: 2,
        },
      },
      prerequisites: {
        totalRows: 7,
        candidateRows: 3,
        excluded: {
          orphanClassId: 1,
          parentMissingCatalogCourseId: 1,
          missingPrerequisiteCourseId: 1,
          selfReference: 1,
        },
        unmatched: {
          externalPrerequisites: 1,
        },
      },
    });

    const coverage = result.reconciliation.sourceCoverage!;
    expect(coverage.coursesData.totalRows).toBe(
      coverage.coursesData.candidateRows + coverage.coursesData.excluded.missingCatalogCourseId,
    );
    expect(coverage.prerequisites.totalRows).toBe(
      coverage.prerequisites.candidateRows +
      coverage.prerequisites.excluded.orphanClassId +
      coverage.prerequisites.excluded.parentMissingCatalogCourseId +
      coverage.prerequisites.excluded.missingPrerequisiteCourseId +
      coverage.prerequisites.excluded.selfReference,
    );

    const trees = validateCourseGraph(result);
    const cs210Tree = trees.find((t) => t.id === "CS210");
    expect(cs210Tree?.tree?.prerequisites?.map((p) => p.course_id)).toEqual(["IT140", "MAT999"]);
    expect(release).toHaveBeenCalled();
  });
});
