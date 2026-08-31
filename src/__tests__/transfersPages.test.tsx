import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquivalencyTable } from "@/features/transfers/components/EquivalencyTable";
import {
  TransfersClientPage,
  type TransferCoursesData,
  type TransferSeoFacets,
} from "@/features/transfers/components/TransfersClientPage";
import type { TransferRow } from "@/features/transfers/lib/seoQueries";

const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/transfers",
  useSearchParams: () => mockUseSearchParams(),
  notFound: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));

describe("Transfers UI Components and Pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("EquivalencyTable component", () => {
    const mockRows: TransferRow[] = [
      {
        subjectPrefix: "CS",
        courseNumber: "CS110",
        title: "Intro to Python",
        pid: "123",
        eligibilityTimeframe: "2020-Present",
        groupFilter2Name: "Sophia Learning",
        academicLevel: "Undergraduate",
        coursePID: "course-123",
      },
    ];

    it("renders rows with canonical transfer links", () => {
      render(<EquivalencyTable rows={mockRows} />);

      const courseLink = screen.getByRole("link", { name: "CS110" });
      expect(courseLink.getAttribute("href")).toBe("/transfers/courses/cs110");

      const orgLink = screen.getByRole("link", { name: "Sophia Learning" });
      expect(orgLink.getAttribute("href")).toBe("/transfers/organizations/sophia-learning");

      const levelLink = screen.getByRole("link", { name: "Undergraduate" });
      expect(levelLink.getAttribute("href")).toBe("/transfers/levels/undergraduate");

      const subjectLink = screen.getByRole("link", { name: "CS" });
      expect(subjectLink.getAttribute("href")).toBe("/transfers/subjects/cs");

      const experienceLink = screen.getByRole("link", { name: "Intro to Python" });
      expect(experienceLink.getAttribute("href")).toContain(
        "#/experiences/123",
      );
      expect(experienceLink.getAttribute("target")).toBe("_blank");
    });
  });

  describe("TransfersClientPage", () => {
    const mockInitialData: TransferCoursesData = {
      CS: {
        CS110: [
          {
            title: "Intro to Python",
            pid: "123",
            eligibilityTimeframe: "2020-Present",
            groupFilter2Name: "Sophia Learning",
            academicLevel: "Undergraduate",
            coursePID: "course-123",
            courseName: "CS110",
          },
        ],
      },
    };

    const mockFacets: TransferSeoFacets = {
      subjects: [{ value: "CS", count: 1, slug: "cs" }],
      organizations: [{ value: "Sophia Learning", count: 1, slug: "sophia-learning" }],
      levels: [{ value: "Undergraduate", count: 1, slug: "undergraduate" }],
      courses: [{ value: "CS110", count: 1, slug: "cs110" }],
    };

    it("renders search input, grouping tabs, and directory facet links under /transfers/", () => {
      render(
        <TransfersClientPage initialCoursesData={mockInitialData} seoFacets={mockFacets} />,
      );

      expect(screen.getByPlaceholderText(/Search by course/i)).toBeDefined();
      expect(screen.getByRole("tablist", { name: /Group results by/i })).toBeDefined();

      const subjectFacetLink = screen.getByRole("link", { name: "CS (1)" });
      expect(subjectFacetLink.getAttribute("href")).toBe("/transfers/subjects/cs");

      const orgFacetLink = screen.getByRole("link", { name: "Sophia Learning (1)" });
      expect(orgFacetLink.getAttribute("href")).toBe("/transfers/organizations/sophia-learning");
    });
  });

  describe("BrowsePage", () => {
    it("renders directory hub sections pointing to /transfers/* directories", async () => {
      const { default: BrowsePage } = await import("@/app/transfers/browse/page");
      render(<BrowsePage />);

      expect(screen.getByRole("heading", { name: "Browse SNHU Transfer Equivalencies" })).toBeDefined();
      expect(screen.getByRole("link", { name: /Browse by Course/i }).getAttribute("href")).toBe(
        "/transfers/courses",
      );
      expect(screen.getByRole("link", { name: /Browse by Subject/i }).getAttribute("href")).toBe(
        "/transfers/subjects",
      );
      expect(screen.getByRole("link", { name: /Browse by Organization/i }).getAttribute("href")).toBe(
        "/transfers/organizations",
      );
      expect(screen.getByRole("link", { name: /Browse by Academic Level/i }).getAttribute("href")).toBe(
        "/transfers/levels",
      );
    });
  });

  describe("CourseTransferPage", () => {
    it("renders course transfer page with prerequisite link pointing to /courses/[id]", async () => {
      vi.doMock("@/features/transfers/lib/seoQueries", () => ({
        getRowsByCourseNumber: vi.fn().mockResolvedValue([
          {
            subjectPrefix: "CS",
            courseNumber: "CS110",
            title: "Intro to Python",
            pid: "123",
            eligibilityTimeframe: "2020-Present",
            groupFilter2Name: "Sophia Learning",
            academicLevel: "Undergraduate",
            coursePID: "course-123",
          },
        ]),
        getRelatedFacets: vi.fn().mockReturnValue({
          subjects: ["CS"],
          organizations: ["Sophia Learning"],
          levels: ["Undergraduate"],
          courses: ["CS110"],
        }),
      }));

      const { default: CourseTransferPage } = await import(
        "@/app/transfers/courses/[courseNumber]/page"
      );
      const jsx = await CourseTransferPage({ params: Promise.resolve({ courseNumber: "CS110" }) });
      render(jsx);

      expect(screen.getByRole("heading", { name: "SNHU CS110 Transfer Options" })).toBeDefined();
      const prereqLink = screen.getByRole("link", { name: "View prerequisites" });
      expect(prereqLink.getAttribute("href")).toBe("/courses/CS110");
    });
  });
});

