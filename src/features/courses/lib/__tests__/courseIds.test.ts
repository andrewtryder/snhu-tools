import { describe, expect, it } from "vitest";
import {
  isValidCourseId,
  normalizeCourseId,
  parseCourseIdList,
  MAX_COURSE_IDS,
} from "../courseIds";

describe("courseIds utilities", () => {
  describe("normalizeCourseId", () => {
    it("converts lowercase and trims spaces and hyphens", () => {
      expect(normalizeCourseId("cs110")).toBe("CS110");
      expect(normalizeCourseId(" cs 110 ")).toBe("CS110");
      expect(normalizeCourseId("IT-140")).toBe("IT140");
      expect(normalizeCourseId("mat-241h")).toBe("MAT241H");
    });
  });

  describe("isValidCourseId", () => {
    it("validates standard SNHU catalog course IDs", () => {
      expect(isValidCourseId("CS110")).toBe(true);
      expect(isValidCourseId("MAT241")).toBe(true);
      expect(isValidCourseId("IT145")).toBe(true);
      expect(isValidCourseId("ENG122H")).toBe(true);
      expect(isValidCourseId("ACC201")).toBe(true);
    });

    it("rejects invalid IDs", () => {
      expect(isValidCourseId("")).toBe(false);
      expect(isValidCourseId("123")).toBe(false);
      expect(isValidCourseId("TOOLONGDEPARTMENT101")).toBe(false);
      expect(isValidCourseId("CS-110")).toBe(false); // must be normalized first
      expect(isValidCourseId("DROP TABLE")).toBe(false);
    });
  });

  describe("parseCourseIdList", () => {
    it("handles empty input", () => {
      const result = parseCourseIdList("");
      expect(result.ids).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe("empty");
    });

    it("parses and deduplicates valid course IDs", () => {
      const result = parseCourseIdList("CS110, it-140, CS110, MAT 241");
      expect(result.ids).toEqual(["CS110", "IT140", "MAT241"]);
      expect(result.errors).toHaveLength(0);
    });

    it("records invalid tokens in errors", () => {
      const result = parseCourseIdList("CS110, invalid_id, IT140");
      expect(result.ids).toEqual(["CS110", "IT140"]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe("invalid");
      expect(result.errors[0]?.id).toBe("invalid_id");
    });

    it("enforces maximum course ID limit", () => {
      const manyIds = Array.from({ length: MAX_COURSE_IDS + 5 }, (_, i) => `CS${100 + i}`).join(",");
      const result = parseCourseIdList(manyIds);
      expect(result.ids).toHaveLength(MAX_COURSE_IDS);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe("too_many");
    });
  });
});
