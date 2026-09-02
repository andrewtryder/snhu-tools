import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TransfersPage, { metadata, getHomepagePayload } from "@/app/transfers/page";
import * as seoQueries from "@/features/transfers/lib/seoQueries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/transfers",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));

describe("Transfers Landing Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows indexing by inheriting deployment-aware robots", () => {
    expect(metadata.robots).toBeUndefined();
  });

  it("loads homepage payload with rows and facets", async () => {
    vi.spyOn(seoQueries, "getAllTransferRows").mockResolvedValueOnce([
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
    ]);

    const payload = await getHomepagePayload();
    expect(payload.dataUnavailable).toBe(false);
    expect(payload.rows).toHaveLength(1);
    expect(payload.facets.subjects[0]?.value).toBe("CS");
  });

  it("renders landing page with heading and search controls", async () => {
    vi.spyOn(seoQueries, "getAllTransferRows").mockResolvedValueOnce([
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
    ]);

    const jsx = await TransfersPage();
    render(jsx);

    expect(
      screen.getByRole("heading", { name: /SNHU Transfer Equivalency List/i }),
    ).toBeDefined();
    expect(screen.getByPlaceholderText(/Search by course/i)).toBeDefined();
  });

  it("renders data unavailable warning gracefully when fetch fails", async () => {
    vi.spyOn(seoQueries, "getAllTransferRows").mockRejectedValueOnce(
      new Error("Database offline"),
    );

    const jsx = await TransfersPage();
    render(jsx);

    expect(
      screen.getByText(/Transfer data is temporarily unavailable/i),
    ).toBeDefined();
  });
});
