import { describe, expect, it } from "vitest";
import {
  aggregateTransferCoverage,
  toDataLastUpdatedAt,
  type TransferCoverageRow,
} from "@/features/transfers/lib/transferCoverage";

describe("Transfers transferCoverage domain service", () => {
  describe("toDataLastUpdatedAt", () => {
    it("handles null and undefined", () => {
      expect(toDataLastUpdatedAt(null)).toBeNull();
      expect(toDataLastUpdatedAt(undefined)).toBeNull();
    });

    it("formats Date and valid date strings into ISO timestamps", () => {
      const now = new Date("2026-08-31T12:00:00.000Z");
      expect(toDataLastUpdatedAt(now)).toBe("2026-08-31T12:00:00.000Z");
      expect(toDataLastUpdatedAt("2026-08-31T12:00:00.000Z")).toBe("2026-08-31T12:00:00.000Z");
    });

    it("returns null for invalid dates", () => {
      expect(toDataLastUpdatedAt("not-a-date")).toBeNull();
    });
  });

  describe("aggregateTransferCoverage", () => {
    const mockRows: TransferCoverageRow[] = [
      { courseNumber: "CS110", pid: "101", groupFilter2Name: "Sophia Learning" },
      { courseNumber: "CS110", pid: "102", groupFilter2Name: "Study.com" },
      { courseNumber: "IT140", pid: "201", groupFilter2Name: "Sophia Learning" },
    ];

    it("aggregates coverage correctly across matched and unmatched courses", () => {
      const result = aggregateTransferCoverage(
        ["CS110", "IT140", "ENG122"],
        mockRows,
        "2026-08-31T12:00:00.000Z",
        "https://snhu-tools.vercel.app",
      );

      expect(result.schemaVersion).toBe(1);
      expect(result.dataLastUpdatedAt).toBe("2026-08-31T12:00:00.000Z");
      expect(result.requestedCourseCount).toBe(3);
      expect(result.matchedCourseCount).toBe(2);

      expect(result.courses).toEqual([
        {
          courseCode: "CS110",
          displayCourseCode: "CS 110",
          hasTransferEquivalencies: true,
          equivalencyCount: 2,
          providerCount: 2,
          providers: ["Sophia Learning", "Study.com"],
          courseUrl: "https://snhu-tools.vercel.app/transfers/courses/cs110",
        },
        {
          courseCode: "IT140",
          displayCourseCode: "IT 140",
          hasTransferEquivalencies: true,
          equivalencyCount: 1,
          providerCount: 1,
          providers: ["Sophia Learning"],
          courseUrl: "https://snhu-tools.vercel.app/transfers/courses/it140",
        },
        {
          courseCode: "ENG122",
          displayCourseCode: "ENG 122",
          hasTransferEquivalencies: false,
          equivalencyCount: 0,
          providerCount: 0,
          providers: [],
          courseUrl: "https://snhu-tools.vercel.app/transfers/courses/eng122",
        },
      ]);
    });

    it("keeps public course URLs canonical for formatted equivalent inputs", () => {
      const result = aggregateTransferCoverage(
        ["CS 210"],
        [],
        null,
        "https://snhu-tools.vercel.app",
      );

      expect(result.courses[0]!.courseUrl).toBe(
        "https://snhu-tools.vercel.app/transfers/courses/cs210",
      );
      expect(result.courses[0]!.courseUrl).not.toContain("cs-210");
    });
  });
});
