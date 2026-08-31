import { describe, expect, it } from "vitest";
import {
  buildFacetSummaries,
  getRelatedFacets,
  type TransferRow,
} from "@/features/transfers/lib/seoQueries";
import {
  summarizeCoursePage,
  summarizeLevelPage,
  summarizeOrganizationPage,
  summarizeSubjectPage,
} from "@/features/transfers/lib/seoSummaries";
import { canonicalPath, normalizeCourseNumber, slugify } from "@/features/transfers/lib/slug";

describe("Transfers SEO & Summary Utilities", () => {
  describe("slug utilities", () => {
    it("generates URL-safe slugs", () => {
      expect(slugify("Sophia Learning")).toBe("sophia-learning");
      expect(slugify("Computer Science (CS)")).toBe("computer-science-cs");
      expect(slugify("  --Study.com--  ")).toBe("study-com");
    });

    it("normalizes course numbers", () => {
      expect(normalizeCourseNumber("cs 110")).toBe("CS110");
      expect(normalizeCourseNumber("IT-140")).toBe("IT140");
    });

    it("builds absolute canonical paths", () => {
      expect(canonicalPath("/transfers/courses/cs110", "https://snhu-tools.vercel.app")).toBe(
        "https://snhu-tools.vercel.app/transfers/courses/cs110",
      );
    });
  });

  describe("summaries", () => {
    const mockRows: TransferRow[] = [
      {
        subjectPrefix: "CS",
        courseNumber: "CS110",
        title: "Intro to Python",
        pid: "123",
        eligibilityTimeframe: "Active",
        groupFilter2Name: "Sophia Learning",
        academicLevel: "Undergraduate",
        coursePID: "course-123",
      },
      {
        subjectPrefix: "CS",
        courseNumber: "CS110",
        title: "Computer Science I",
        pid: "456",
        eligibilityTimeframe: "Active",
        groupFilter2Name: "Study.com",
        academicLevel: "Undergraduate",
        coursePID: "course-123",
      },
    ];

    it("summarizes course pages", () => {
      const summary = summarizeCoursePage("CS110", mockRows);
      expect(summary).toBe(
        "SNHU CS110 currently has 2 listed transfer options from 2 organizations across 1 academic level.",
      );
    });

    it("summarizes subject pages", () => {
      const summary = summarizeSubjectPage("CS", mockRows);
      expect(summary).toBe(
        "The CS subject includes 2 listed transfer options across 1 SNHU course from 2 organizations.",
      );
    });

    it("summarizes organization pages", () => {
      const summary = summarizeOrganizationPage("Sophia Learning", [mockRows[0]!]);
      expect(summary).toBe(
        "Sophia Learning currently has 1 listed transfer option mapping to 1 SNHU course across 1 subject area.",
      );
    });

    it("summarizes level pages", () => {
      const summary = summarizeLevelPage("Undergraduate", mockRows);
      expect(summary).toBe(
        "The Undergraduate directory contains 2 listed transfer options across 1 SNHU course from 2 organizations.",
      );
    });
  });

  describe("pure facet derivation", () => {
    const mockRows: TransferRow[] = [
      {
        subjectPrefix: "CS",
        courseNumber: "CS110",
        title: "Intro to Python",
        pid: "123",
        eligibilityTimeframe: "Active",
        groupFilter2Name: "Sophia Learning",
        academicLevel: "Undergraduate",
        coursePID: "course-123",
      },
      {
        subjectPrefix: "IT",
        courseNumber: "IT140",
        title: "Introduction to Scripting",
        pid: "789",
        eligibilityTimeframe: "Active",
        groupFilter2Name: "Sophia Learning",
        academicLevel: "Undergraduate",
        coursePID: "course-456",
      },
    ];

    it("builds sorted facet summaries without querying DB", () => {
      const facets = buildFacetSummaries(mockRows);
      expect(facets.subjects).toEqual([
        { value: "CS", count: 1, slug: "cs" },
        { value: "IT", count: 1, slug: "it" },
      ]);
      expect(facets.organizations).toEqual([
        { value: "Sophia Learning", count: 2, slug: "sophia-learning" },
      ]);
    });

    it("derives related facets from rows", () => {
      const related = getRelatedFacets(mockRows);
      expect(related.subjects).toEqual(["CS", "IT"]);
      expect(related.organizations).toEqual(["Sophia Learning"]);
      expect(related.courses).toEqual(["CS110", "IT140"]);
      expect(related.levels).toEqual(["Undergraduate"]);
    });
  });
});
