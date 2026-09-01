import { describe, expect, it, vi, beforeEach } from "vitest";
import { fixturePrograms } from "@/data/fixturePrograms";
import type { DegreeProgram } from "@/types/program";

const getTransferCoverageResponse = vi.fn();

vi.mock("@/features/transfers/lib/transferCoverage", () => ({
  getTransferCoverageResponse: (...args: unknown[]) => getTransferCoverageResponse(...args),
}));

import {
  collectProgramCoverageCourseCodes,
  getProgramTransferCoverage,
  parseCoverageUpdatedAt,
} from "@/lib/transferCoverage.server";

function coverage(codes: string[], options: { matched?: boolean; timestamp?: string | null } = {}) {
  const matched = options.matched ?? false;
  return {
    schemaVersion: 1 as const,
    dataLastUpdatedAt: options.timestamp === undefined ? "2026-08-02T00:00:00.000Z" : options.timestamp,
    requestedCourseCount: codes.length,
    matchedCourseCount: matched ? codes.length : 0,
    courses: codes.map((courseCode) => ({
      courseCode,
      displayCourseCode: courseCode,
      hasTransferEquivalencies: matched,
      equivalencyCount: matched ? 1 : 0,
      providerCount: matched ? 1 : 0,
      providers: matched ? ["Test College"] : [],
      courseUrl: `https://example.test/transfers/courses/${courseCode.toLowerCase()}`,
    })),
  };
}

describe("transferCoverage.server", () => {
  const csProgram = fixturePrograms.find((program) => program.slug === "computer-science-bs")!;

  beforeEach(() => {
    getTransferCoverageResponse.mockReset();
  });

  it("collects eligible normalized, deduplicated course codes in first-seen order", () => {
    const program: DegreeProgram = {
      ...csProgram,
      nodes: [
        { ...csProgram.nodes[0]!, code: "CS 110", isPlaceholder: false, isExternal: false },
        { ...csProgram.nodes[0]!, id: "duplicate", code: "cs-110", isPlaceholder: false, isExternal: false },
        { ...csProgram.nodes[0]!, id: "external", code: "CS 999", isExternal: true },
        { ...csProgram.nodes[0]!, id: "placeholder", code: "ELEC 1", isPlaceholder: true },
        { ...csProgram.nodes[0]!, id: "empty", code: "   ", isPlaceholder: false, isExternal: false },
      ],
    };

    expect(collectProgramCoverageCourseCodes(program)).toEqual(["CS110"]);
  });

  it("returns available empty coverage without calling the Transfers service", async () => {
    const program: DegreeProgram = { ...csProgram, nodes: [] };

    await expect(getProgramTransferCoverage(program)).resolves.toEqual({
      status: "available",
      data: {
        schemaVersion: 1,
        dataLastUpdatedAt: null,
        requestedCourseCount: 0,
        matchedCourseCount: 0,
        courses: [],
      },
    });
    expect(getTransferCoverageResponse).not.toHaveBeenCalled();
  });

  it("calls the local service without making an HTTP request", async () => {
    const codes = collectProgramCoverageCourseCodes(csProgram);
    getTransferCoverageResponse.mockResolvedValue(coverage(codes, { matched: true }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getProgramTransferCoverage(csProgram);

    expect(result.status).toBe("available");
    expect(getTransferCoverageResponse).toHaveBeenCalledWith(codes);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves local service coverage data", async () => {
    const codes = collectProgramCoverageCourseCodes(csProgram);
    getTransferCoverageResponse.mockResolvedValue(coverage(codes, { matched: true, timestamp: null }));

    const result = await getProgramTransferCoverage(csProgram);

    expect(result).toMatchObject({
      status: "available",
      data: {
        schemaVersion: 1,
        dataLastUpdatedAt: null,
        requestedCourseCount: codes.length,
        matchedCourseCount: codes.length,
      },
    });
  });

  it("uses bounded batches and restores original program order", async () => {
    const nodes = Array.from({ length: 105 }, (_, index) => ({
      ...csProgram.nodes[0]!,
      id: `course-${index}`,
      code: `CS ${100 + index}`,
      isPlaceholder: false,
      isExternal: false,
    }));
    const program: DegreeProgram = { ...csProgram, nodes };
    getTransferCoverageResponse.mockImplementation(async (codes: string[]) => coverage([...codes].reverse()));

    const result = await getProgramTransferCoverage(program);

    expect(getTransferCoverageResponse).toHaveBeenCalledTimes(2);
    expect(getTransferCoverageResponse.mock.calls[0]![0]).toHaveLength(100);
    expect(getTransferCoverageResponse.mock.calls[1]![0]).toHaveLength(5);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.data.requestedCourseCount).toBe(105);
      expect(result.data.matchedCourseCount).toBe(0);
      expect(result.data.courses.map((course) => course.courseCode)).toEqual(
        nodes.map((node) => node.code.replace(/[\s-]+/g, "")),
      );
    }
  });

  it("returns unavailable when the local service fails instead of fabricating zero coverage", async () => {
    getTransferCoverageResponse.mockRejectedValue(new Error("database unavailable"));

    await expect(getProgramTransferCoverage(csProgram)).resolves.toEqual({ status: "unavailable" });
  });

  it("returns unavailable when a batch omits a requested course", async () => {
    const codes = collectProgramCoverageCourseCodes(csProgram);
    getTransferCoverageResponse.mockResolvedValue(coverage(codes.slice(1)));

    await expect(getProgramTransferCoverage(csProgram)).resolves.toEqual({ status: "unavailable" });
  });

  it("parses coverage timestamps safely for merge validation", () => {
    expect(parseCoverageUpdatedAt(null)).toBeNull();
    expect(parseCoverageUpdatedAt("not-a-date")).toBeNull();
    expect(parseCoverageUpdatedAt("2026-08-02T00:00:00.000Z")?.toISOString()).toBe(
      "2026-08-02T00:00:00.000Z",
    );
  });
});
