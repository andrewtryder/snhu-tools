import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/transfer-coverage/route";
import * as transferCoverageService from "@/features/transfers/lib/transferCoverage";

vi.mock("@/features/transfers/lib/transferCoverage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/transfers/lib/transferCoverage")>();
  return {
    ...actual,
    getTransferCoverageResponse: vi.fn(),
  };
});

describe("GET /api/v1/transfer-coverage route handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 MISSING_COURSES when courses param is missing", async () => {
    const request = new Request("https://snhu-tools.vercel.app/api/v1/transfer-coverage");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("MISSING_COURSES");
  });

  it("returns 400 INVALID_COURSE_CODE when query exceeds 2000 characters", async () => {
    const longParam = "A".repeat(2001);
    const request = new Request(
      `https://snhu-tools.vercel.app/api/v1/transfer-coverage?courses=${longParam}`,
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_COURSE_CODE");
  });

  it("returns 400 INVALID_COURSE_CODE for malformed codes", async () => {
    const request = new Request(
      "https://snhu-tools.vercel.app/api/v1/transfer-coverage?courses=CS110,bad-course",
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_COURSE_CODE");
    expect(body.error.invalidCourseCodes).toEqual(["bad-course"]);
  });

  it("returns 400 TOO_MANY_COURSES when more than 100 unique valid course codes are requested", async () => {
    // 101 unique valid codes (CS100 ... CS200), total string length ~600 chars (< 2000 limit)
    const codes = Array.from({ length: 101 }, (_, i) => `CS${100 + i}`).join(",");
    expect(codes.length).toBeLessThan(2000);

    const request = new Request(
      `https://snhu-tools.vercel.app/api/v1/transfer-coverage?courses=${codes}`,
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("TOO_MANY_COURSES");
    expect(body.error.message).toBe("A maximum of 100 unique course codes may be requested.");
    expect(transferCoverageService.getTransferCoverageResponse).not.toHaveBeenCalled();
  });

  it("deduplicates variations and succeeds when unique course count is within 100 limit", async () => {
    vi.mocked(transferCoverageService.getTransferCoverageResponse).mockResolvedValueOnce({
      schemaVersion: 1,
      dataLastUpdatedAt: "2026-08-31T12:00:00.000Z",
      requestedCourseCount: 1,
      matchedCourseCount: 1,
      courses: [
        {
          courseCode: "CS110",
          displayCourseCode: "CS 110",
          hasTransferEquivalencies: true,
          equivalencyCount: 1,
          providerCount: 1,
          providers: ["Sophia Learning"],
          courseUrl: "https://snhu-tools.vercel.app/transfers/courses/cs110",
        },
      ],
    });

    // 4 variants of CS110 plus duplicates
    const request = new Request(
      "https://snhu-tools.vercel.app/api/v1/transfer-coverage?courses=CS110,cs110,CS-110,CS 110,cs-110",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(transferCoverageService.getTransferCoverageResponse).toHaveBeenCalledWith(["CS110"]);
  });

  it("returns 200 with cache and last-modified headers for valid requests", async () => {
    vi.mocked(transferCoverageService.getTransferCoverageResponse).mockResolvedValueOnce({
      schemaVersion: 1,
      dataLastUpdatedAt: "2026-08-31T12:00:00.000Z",
      requestedCourseCount: 1,
      matchedCourseCount: 1,
      courses: [
        {
          courseCode: "CS110",
          displayCourseCode: "CS 110",
          hasTransferEquivalencies: true,
          equivalencyCount: 1,
          providerCount: 1,
          providers: ["Sophia Learning"],
          courseUrl: "https://snhu-tools.vercel.app/transfers/courses/cs110",
        },
      ],
    });

    const request = new Request(
      "https://snhu-tools.vercel.app/api/v1/transfer-coverage?courses=CS110",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=3600",
    );
    expect(response.headers.get("CDN-Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=3600",
    );
    expect(response.headers.get("Last-Modified")).toBe("Mon, 31 Aug 2026 12:00:00 GMT");

    const body = await response.json();
    expect(body.courses[0].courseUrl).toBe(
      "https://snhu-tools.vercel.app/transfers/courses/cs110",
    );
  });

  it("returns 503 TRANSFER_DATA_UNAVAILABLE when database throws", async () => {
    vi.mocked(transferCoverageService.getTransferCoverageResponse).mockRejectedValueOnce(
      new Error("Database connection failure"),
    );

    const request = new Request(
      "https://snhu-tools.vercel.app/api/v1/transfer-coverage?courses=CS110",
    );
    const response = await GET(request);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("TRANSFER_DATA_UNAVAILABLE");
    expect(body.error.message).toBe("Transfer-equivalency data is temporarily unavailable.");
  });
});
