import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as globalSearchGET } from "@/app/api/global-search/route";
import { GET as legacyProgramSearchGET } from "@/app/api/search/route";
import * as globalSearchModule from "@/lib/search/globalSearch";

vi.mock("@/lib/search/globalSearch", () => ({
  searchAll: vi.fn(),
}));

describe("GET /api/global-search API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty grouped structure when query is under 2 characters", async () => {
    const req = new Request("http://localhost/api/global-search?q=c");
    const res = await globalSearchGET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.query).toBe("c");
    expect(json.counts.total).toBe(0);
    expect(json.results.programs).toEqual([]);
    expect(json.results.courses).toEqual([]);
    expect(json.results.transfers).toEqual([]);
    expect(globalSearchModule.searchAll).not.toHaveBeenCalled();
  });

  it("returns grouped results with public cache headers for valid query", async () => {
    vi.mocked(globalSearchModule.searchAll).mockResolvedValueOnce({
      query: "cs210",
      results: {
        programs: [],
        courses: [
          {
            type: "course",
            id: "CS210",
            title: "CS210",
            subtitle: "Programming Languages",
            href: "/courses/CS210",
          },
        ],
        transfers: [
          {
            type: "transfer",
            id: "CS210",
            title: "CS210",
            subtitle: "2 transfer options",
            href: "/transfers/courses/cs210",
            optionCount: 2,
          },
        ],
      },
      counts: {
        programs: 0,
        courses: 1,
        transfers: 1,
        total: 2,
      },
    });

    const req = new Request("http://localhost/api/global-search?q=cs210&limit=5");
    const res = await globalSearchGET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("public");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=");

    const json = await res.json();
    expect(json.counts.courses).toBe(1);
    expect(json.counts.transfers).toBe(1);
    expect(json.results.courses[0].href).toBe("/courses/CS210");
    expect(json.results.transfers[0].href).toBe("/transfers/courses/cs210");
  });

  it("returns sanitized 500 without leaking credentials or stack traces on failure", async () => {
    vi.mocked(globalSearchModule.searchAll).mockRejectedValueOnce(
      new Error("FATAL: database connection refused at 10.0.0.1:5432 with password [SECRET]")
    );

    const req = new Request("http://localhost/api/global-search?q=accounting");
    const res = await globalSearchGET(req);
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const json = await res.json();
    expect(json.error).toBe("Global search is temporarily unavailable.");
    expect(JSON.stringify(json)).not.toContain("password");
    expect(JSON.stringify(json)).not.toContain("10.0.0.1");
  });

  it("preserves legacy /api/search contract as Programs-only", async () => {
    const req = new Request("http://localhost/api/search?q=c");
    const res = await legacyProgramSearchGET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty("results");
    expect(json).toHaveProperty("query");
    expect(Array.isArray(json.results)).toBe(true);
  });
});
