import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramTransferCoverage } from "@/components/programs/ProgramTransferCoverage";
import { fixturePrograms } from "@/data/fixturePrograms";
import type { TransferCoverageCourse, TransferCoverageResult } from "@/lib/transferCoverage.server";

const getProgramTransferCoverage = vi.fn();

vi.mock("@/lib/transferCoverage.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/transferCoverage.server")>(
    "@/lib/transferCoverage.server",
  );
  return {
    ...actual,
    getProgramTransferCoverage: (...args: unknown[]) => getProgramTransferCoverage(...args),
  };
});

function makeCourse(index: number, hasTransfer = true): TransferCoverageCourse {
  const code = `CS${String(100 + index).padStart(3, "0")}`;
  const display = `CS ${100 + index}`;
  return {
    courseCode: code,
    displayCourseCode: display,
    hasTransferEquivalencies: hasTransfer,
    equivalencyCount: hasTransfer ? 1 : 0,
    providerCount: hasTransfer ? 1 : 0,
    providers: hasTransfer ? ["Test College"] : [],
    courseUrl: `https://snhu-transfers.vercel.app/courses/${code}`,
  };
}

describe("ProgramTransferCoverage UI", () => {
  const program = fixturePrograms.find((entry) => entry.slug === "computer-science-bs")!;

  beforeEach(() => {
    getProgramTransferCoverage.mockReset();
  });

  it("shows all matched transfer courses without a disclosure", async () => {
    const courses = Array.from({ length: 11 }, (_, index) => makeCourse(index));
    getProgramTransferCoverage.mockResolvedValue({
      status: "available",
      data: {
        schemaVersion: 1,
        dataLastUpdatedAt: "2026-01-15T00:00:00.000Z",
        requestedCourseCount: 11,
        matchedCourseCount: 11,
        courses,
      },
    } satisfies TransferCoverageResult);

    render(await ProgramTransferCoverage({ program }));

    expect(screen.getByRole("heading", { name: "Transfer Integration" })).toBeInTheDocument();
    expect(
      screen.getByText("11 of 11 identified program courses have known transfer listings."),
    ).toBeInTheDocument();
    expect(screen.getByText("Courses with known transfer listings")).toBeInTheDocument();
    expect(screen.queryByText(/Transfer data last updated/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Show \d+ more courses/)).not.toBeInTheDocument();
    expect(document.querySelector("details")).toBeNull();

    for (let index = 0; index < 11; index += 1) {
      expect(
        screen.getByRole("link", { name: `View transfer equivalencies for CS ${100 + index}` }),
      ).toBeInTheDocument();
    }

    expect(screen.getAllByRole("link", { name: /View transfer equivalencies for CS / })).toHaveLength(11);
    expect(document.querySelector(".grid")).toBeTruthy();
    expect(document.querySelector(".rounded-full")).toBeNull();
  }, 15000);

  it("shows a concise no-match message when coverage is available but empty", async () => {
    getProgramTransferCoverage.mockResolvedValue({
      status: "available",
      data: {
        schemaVersion: 1,
        dataLastUpdatedAt: null,
        requestedCourseCount: 4,
        matchedCourseCount: 0,
        courses: [makeCourse(0, false), makeCourse(1, false)],
      },
    } satisfies TransferCoverageResult);

    render(await ProgramTransferCoverage({ program }));

    expect(screen.getByText("0 of 4 identified program courses have known transfer listings.")).toBeInTheDocument();
    expect(
      screen.getByText("No known transfer listings were found for the identified program courses."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Courses with known transfer listings")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View transfer equivalencies/ })).not.toBeInTheDocument();
  });

  it("keeps the unavailable state distinct from zero coverage", async () => {
    getProgramTransferCoverage.mockResolvedValue({ status: "unavailable" } satisfies TransferCoverageResult);

    render(await ProgramTransferCoverage({ program }));

    expect(screen.getByText("Transfer-equivalency coverage is temporarily unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(/identified program courses have known transfer listings/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("No known transfer listings were found for the identified program courses."),
    ).not.toBeInTheDocument();
  });
});
