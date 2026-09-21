import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/search/route";

describe("GET /api/search API Endpoint", () => {
  it("returns empty results array when query is under 2 characters", async () => {
    const req = new Request("http://localhost/api/search?q=c");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.results).toEqual([]);
  });

  it("returns matched programs for valid search query", async () => {
    const req = new Request("http://localhost/api/search?q=Computer");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=900, stale-while-revalidate=3600",
    );

    const json = await res.json();
    expect(json.results.length).toBeGreaterThan(0);
    expect(json.results[0].title).toContain("Computer");
  });

  it("bounds max results limit parameter to at most 30", async () => {
    const req = new Request("http://localhost/api/search?q=BS&limit=100");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.results.length).toBeLessThanOrEqual(30);
  });
});
