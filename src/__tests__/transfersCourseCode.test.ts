import { describe, expect, it } from "vitest";
import {
  formatTransferCourseCode,
  isValidTransferCourseCode,
  normalizeTransferCourseCode,
} from "@/lib/courseCode";
import { transferCoursePath } from "@/features/transfers/lib/slug";

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

  describe("transferCoursePath", () => {
    it("uses one canonical path for equivalent course-code formats", () => {
      expect(transferCoursePath("CS210")).toBe("/transfers/courses/cs210");
      expect(transferCoursePath("CS 210")).toBe("/transfers/courses/cs210");
      expect(transferCoursePath("CS-210")).toBe("/transfers/courses/cs210");
      expect(transferCoursePath("cs 210")).toBe("/transfers/courses/cs210");
    });

    it("preserves valid course-code suffixes", () => {
      expect(transferCoursePath("BIO120L")).toBe("/transfers/courses/bio120l");
      expect(transferCoursePath("ACC1ELE")).toBe("/transfers/courses/acc1ele");
    });
  });
});
