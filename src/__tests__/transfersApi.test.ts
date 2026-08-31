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
    const request = new Request("https://snhu-degreemap.vercel.app/api/v1/transfer-coverage");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("MISSING_COURSES");
  });

  it("returns 400 INVALID_COURSE_CODE when query exceeds 2000 characters", async () => {
    const longParam = "A".repeat(2001);
    const request = new Request(
      `https://snhu-degreemap.vercel.app/api/v1/transfer-coverage?courses=${longParam}`,
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_COURSE_CODE");
  });

  it("returns 400 INVALID_COURSE_CODE for malformed codes", async () => {
    const request = new Request(
      "https://snhu-degreemap.vercel.app/api/v1/transfer-coverage?courses=CS110,bad-course",
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_COURSE_CODE");
    expect(body.error.invalidCourseCodes).toEqual(["bad-course"]);
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
          courseUrl: "https://snhu-degreemap.vercel.app/transfers/courses/cs110",
        },
      ],
    });

    const request = new Request(
      "https://snhu-degreemap.vercel.app/api/v1/transfer-coverage?courses=CS110",
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
      "https://snhu-degreemap.vercel.app/transfers/courses/cs110",
    );
  });

  it("returns 503 TRANSFER_DATA_UNAVAILABLE when database throws", async () => {
    vi.mocked(transferCoverageService.getTransferCoverageResponse).mockRejectedValueOnce(
      new Error("Database connection failure"),
    );

    const request = new Request(
      "https://snhu-degreemap.vercel.app/api/v1/transfer-coverage?courses=CS110",
    );
    const response = await GET(request);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("TRANSFER_DATA_UNAVAILABLE");
    expect(body.error.message).toBe("Transfer-equivalency data is temporarily unavailable.");
  });
});
