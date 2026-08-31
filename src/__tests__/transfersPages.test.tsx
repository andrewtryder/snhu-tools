import { fireEvent, render, screen } from "@testing-library/react";
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
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
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
      expect(experienceLink.getAttribute("href")).toContain("#/experiences/123");
      expect(experienceLink.getAttribute("target")).toBe("_blank");
    });
  });

  describe("TransfersClientPage Grouping & Filtering", () => {
    const mockDataset: TransferCoursesData = {
      CS: {
        CS110: [
          {
            subjectPrefix: "CS",
            courseNumber: "CS110",
            title: "Intro to Python",
            pid: "pid-110",
            eligibilityTimeframe: "2020-Present",
            groupFilter2Name: "Sophia Learning",
            academicLevel: "Undergraduate",
            coursePID: "c-110",
            courseName: "CS110",
          },
        ],
        CS210: [
          {
            subjectPrefix: "CS",
            courseNumber: "CS210",
            title: "Data Structures",
            pid: "pid-210",
            eligibilityTimeframe: "2021-Present",
            groupFilter2Name: "Study.com",
            academicLevel: "Undergraduate",
            coursePID: "c-210",
            courseName: "CS210",
          },
        ],
      },
      MAT: {
        MAT240: [
          {
            subjectPrefix: "MAT",
            courseNumber: "MAT240",
            title: "Applied Statistics",
            pid: "pid-240",
            eligibilityTimeframe: "2019-Present",
            groupFilter2Name: "Sophia Learning",
            academicLevel: "Graduate",
            coursePID: "c-240",
            courseName: "MAT240",
          },
        ],
      },
    };

    const mockFacets: TransferSeoFacets = {
      subjects: [
        { value: "CS", count: 2, slug: "cs" },
        { value: "MAT", count: 1, slug: "mat" },
      ],
      organizations: [
        { value: "Sophia Learning", count: 2, slug: "sophia-learning" },
        { value: "Study.com", count: 1, slug: "study-com" },
      ],
      levels: [
        { value: "Undergraduate", count: 2, slug: "undergraduate" },
        { value: "Graduate", count: 1, slug: "graduate" },
      ],
      courses: [
        { value: "CS110", count: 1, slug: "cs110" },
        { value: "CS210", count: 1, slug: "cs210" },
        { value: "MAT240", count: 1, slug: "mat240" },
      ],
    };

    it("groups by true subject prefix by default, keeping course codes visible on expansion", () => {
      render(
        <TransfersClientPage initialCoursesData={mockDataset} seoFacets={mockFacets} />,
      );

      const tablist = screen.getByRole("tablist", { name: /Group results by/i });
      expect(tablist).toBeDefined();

      const subjectTab = screen.getByRole("tab", { name: /By Subject/i });
      expect(subjectTab.getAttribute("aria-selected")).toBe("true");

      // Verify subject group headings exist and individual course numbers are NOT group headings
      const csGroupRow = screen.getByRole("button", { name: /CS.*2 items/i });
      expect(csGroupRow).toBeDefined();
      const matGroupRow = screen.getByRole("button", { name: /MAT.*1 item/i });
      expect(matGroupRow).toBeDefined();
      expect(screen.queryByRole("button", { name: /^CS110/i })).toBeNull();

      // Expand "CS" group
      fireEvent.click(csGroupRow);
      expect(csGroupRow.getAttribute("aria-expanded")).toBe("true");

      // Both CS110 and CS210 are visible in the expanded table
      const cs110Link = screen.getByRole("link", { name: "CS110" });
      expect(cs110Link.getAttribute("href")).toBe("/transfers/courses/cs110");
      const cs210Link = screen.getByRole("link", { name: "CS210" });
      expect(cs210Link.getAttribute("href")).toBe("/transfers/courses/cs210");

      // Organization, Title, Level, Timeframe headers and cells are visible
      expect(screen.getByText("Sophia Learning")).toBeDefined();
      expect(screen.getByText("Study.com")).toBeDefined();
    });

    it("groups by organization when Organization tab is clicked", () => {
      render(
        <TransfersClientPage initialCoursesData={mockDataset} seoFacets={mockFacets} />,
      );

      const orgTab = screen.getByRole("tab", { name: /By Organization/i });
      fireEvent.click(orgTab);
      expect(orgTab.getAttribute("aria-selected")).toBe("true");

      const sophiaGroupRow = screen.getByRole("button", { name: /Sophia Learning.*2 items/i });
      expect(sophiaGroupRow).toBeDefined();
      const studyGroupRow = screen.getByRole("button", { name: /Study\.com.*1 item/i });
      expect(studyGroupRow).toBeDefined();

      // Expand "Sophia Learning" group
      fireEvent.click(sophiaGroupRow);
      expect(sophiaGroupRow.getAttribute("aria-expanded")).toBe("true");

      // Reveals CS110 and MAT240
      expect(screen.getByRole("link", { name: "CS110" })).toBeDefined();
      expect(screen.getByRole("link", { name: "MAT240" })).toBeDefined();
      expect(screen.queryByRole("link", { name: "CS210" })).toBeNull();
    });

    it("groups by academic level when Level tab is clicked", () => {
      render(
        <TransfersClientPage initialCoursesData={mockDataset} seoFacets={mockFacets} />,
      );

      const levelTab = screen.getByRole("tab", { name: /By Level/i });
      fireEvent.click(levelTab);
      expect(levelTab.getAttribute("aria-selected")).toBe("true");

      const underGroupRow = screen.getByRole("button", { name: /Undergraduate.*2 items/i });
      expect(underGroupRow).toBeDefined();
      const gradGroupRow = screen.getByRole("button", { name: /Graduate.*1 item/i });
      expect(gradGroupRow).toBeDefined();

      // Expand "Undergraduate" group
      fireEvent.click(underGroupRow);
      expect(underGroupRow.getAttribute("aria-expanded")).toBe("true");

      // Reveals CS110 and CS210
      expect(screen.getByRole("link", { name: "CS110" })).toBeDefined();
      expect(screen.getByRole("link", { name: "CS210" })).toBeDefined();
      expect(screen.queryByRole("link", { name: "MAT240" })).toBeNull();
    });

    it("initializes search input and filters data when ?q=... is present in URL", () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams("q=python"));

      render(
        <TransfersClientPage initialCoursesData={mockDataset} seoFacets={mockFacets} />,
      );

      const searchInput = screen.getByPlaceholderText(/Search by course/i) as HTMLInputElement;
      expect(searchInput.value).toBe("python");

      // Only CS group with 1 item (CS110 - Intro to Python) matches
      const csGroupRow = screen.getByRole("button", { name: /CS.*1 item/i });
      expect(csGroupRow).toBeDefined();
      expect(screen.queryByRole("button", { name: /MAT/i })).toBeNull();
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
