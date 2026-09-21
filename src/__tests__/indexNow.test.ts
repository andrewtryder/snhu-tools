import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getIndexNowUrls,
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  submitIndexNow,
} from "@/lib/indexNow";

vi.mock("@/lib/serverData", () => ({
  getSitemapPrograms: vi.fn(() =>
    Promise.resolve([
      { slug: "accounting-bs", updatedAt: null },
      { slug: "computer-science-bs", updatedAt: null },
    ]),
  ),
}));

vi.mock("@/features/courses/lib/courses", () => ({
  getSitemapCatalogData: vi.fn(() =>
    Promise.resolve({
      courseIds: ["CS210", "IT140"],
      catalogLastModified: null,
    }),
  ),
}));

vi.mock("@/features/transfers/lib/seoQueries", () => ({
  getTransferSitemapData: vi.fn(() =>
    Promise.resolve({
      courseNumbers: ["CS210"],
      subjects: ["Computer Science (CS)"],
      organizations: ["Sophia Learning"],
      levels: ["Undergraduate"],
      lastModified: null,
    }),
  ),
}));

describe("IndexNow integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://snhu-tools.vercel.app",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("hosts the root verification key file with the exact key", () => {
    const keyFile = readFileSync(join(process.cwd(), "public", `${INDEXNOW_KEY}.txt`), "utf8");
    expect(keyFile.trim()).toBe(INDEXNOW_KEY);
  });

  it("builds canonical program URLs without search or legacy hosts", async () => {
    const urls = await getIndexNowUrls("programs");

    expect(urls).toContain("https://snhu-tools.vercel.app");
    expect(urls).toContain("https://snhu-tools.vercel.app/programs");
    expect(urls).toContain("https://snhu-tools.vercel.app/programs/bachelors");
    expect(urls).toContain("https://snhu-tools.vercel.app/programs/computer-science-bs");
    expect(urls).toContain("https://snhu-tools.vercel.app/programs/computer-science-bs/requirements");
    expect(urls.every((url) => new URL(url).origin === "https://snhu-tools.vercel.app")).toBe(true);
    expect(urls.some((url) => url.includes("/search"))).toBe(false);
  });

  it("submits a scoped canonical URL batch to the global IndexNow endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitIndexNow("courses");

    expect(result).toMatchObject({
      submitted: true,
      scope: "courses",
      status: 200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe(INDEXNOW_ENDPOINT);

    const payload = JSON.parse(String(init.body)) as {
      host: string;
      key: string;
      keyLocation: string;
      urlList: string[];
    };

    expect(payload.host).toBe("snhu-tools.vercel.app");
    expect(payload.key).toBe(INDEXNOW_KEY);
    expect(payload.keyLocation).toBe(
      `https://snhu-tools.vercel.app/${INDEXNOW_KEY}.txt`,
    );
    expect(payload.urlList).toEqual([
      "https://snhu-tools.vercel.app/courses",
      "https://snhu-tools.vercel.app/courses/CS210",
      "https://snhu-tools.vercel.app/courses/IT140",
    ]);
  });

  it("never submits from preview deployments", async () => {
    process.env.VERCEL_ENV = "preview";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitIndexNow("transfers")).resolves.toEqual({
      submitted: false,
      scope: "transfers",
      urlCount: 0,
      reason: "non-production",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces non-success responses to the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    );

    await expect(submitIndexNow("courses")).rejects.toThrow(
      "IndexNow submission failed with HTTP 403",
    );
  });
});
