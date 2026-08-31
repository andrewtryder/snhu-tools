import { describe, expect, it } from "vitest";
import {
  formatTransferCourseCode,
  isValidTransferCourseCode,
  normalizeTransferCourseCode,
  parseCoursesQuery,
} from "@/features/transfers/lib/courseCode";

describe("Transfers courseCode utilities", () => {
  describe("normalizeTransferCourseCode", () => {
    it("converts lowercase to uppercase", () => {
      expect(normalizeTransferCourseCode("cs110")).toBe("CS110");
      expect(normalizeTransferCourseCode("it-140")).toBe("IT140");
      expect(normalizeTransferCourseCode("mat 240")).toBe("MAT240");
    });

    it("trims whitespace and removes hyphens and spaces", () => {
      expect(normalizeTransferCourseCode("  ENG 122  ")).toBe("ENG122");
      expect(normalizeTransferCourseCode("ACC-201")).toBe("ACC201");
      expect(normalizeTransferCourseCode("BIO-120L")).toBe("BIO120L");
    });
  });

  describe("formatTransferCourseCode", () => {
    it("formats standard alphanumeric codes with space", () => {
      expect(formatTransferCourseCode("CS110")).toBe("CS 110");
      expect(formatTransferCourseCode("BIO120L")).toBe("BIO 120L");
      expect(formatTransferCourseCode("ACC1ELE")).toBe("ACC 1ELE");
    });

    it("handles pre-spaced and lowercased input", () => {
      expect(formatTransferCourseCode("cs 110")).toBe("CS 110");
      expect(formatTransferCourseCode("it-140")).toBe("IT 140");
    });
  });

  describe("isValidTransferCourseCode", () => {
    it("accepts standard SNHU transfer course codes", () => {
      expect(isValidTransferCourseCode("CS110")).toBe(true);
      expect(isValidTransferCourseCode("ENG122")).toBe(true);
      expect(isValidTransferCourseCode("BIO120L")).toBe(true);
      expect(isValidTransferCourseCode("ACC1ELE")).toBe(true);
      expect(isValidTransferCourseCode("mat 240")).toBe(true);
    });

    it("rejects empty or invalid course code formats", () => {
      expect(isValidTransferCourseCode("")).toBe(false);
      expect(isValidTransferCourseCode("123")).toBe(false);
      expect(isValidTransferCourseCode("CS")).toBe(false);
      expect(isValidTransferCourseCode("DROP TABLE")).toBe(false);
    });
  });

  describe("parseCoursesQuery", () => {
    it("returns MISSING_COURSES on null, undefined, or empty strings", () => {
      expect(parseCoursesQuery(null)).toEqual({ ok: false, error: "MISSING_COURSES" });
      expect(parseCoursesQuery("")).toEqual({ ok: false, error: "MISSING_COURSES" });
      expect(parseCoursesQuery(" , , ")).toEqual({ ok: false, error: "MISSING_COURSES" });
    });

    it("parses and deduplicates valid course codes preserving order", () => {
      const result = parseCoursesQuery("CS110, it-140, CS110, MAT 240");
      expect(result).toEqual({
        ok: true,
        courseCodes: ["CS110", "IT140", "MAT240"],
      });
    });

    it("returns INVALID_COURSE_CODE when any code is invalid", () => {
      const result = parseCoursesQuery("CS110, bad_code, MAT240");
      expect(result).toEqual({
        ok: false,
        error: "INVALID_COURSE_CODE",
        invalidCourseCodes: ["bad_code"],
      });
    });

    it("returns TOO_MANY_COURSES when exceeding max limit", () => {
      const codes = Array.from({ length: 101 }, (_, i) => `CS${100 + i}`).join(",");
      const result = parseCoursesQuery(codes);
      expect(result).toEqual({
        ok: false,
        error: "TOO_MANY_COURSES",
      });
    });
  });
});
