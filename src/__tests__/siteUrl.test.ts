import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSiteUrl, PRODUCTION_SITE_URL } from "@/lib/siteUrl";

describe("getSiteUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("falls back to the canonical production site URL when no env is set", () => {
    expect(getSiteUrl()).toBe("https://snhu-tools.vercel.app");
    expect(getSiteUrl()).toBe(PRODUCTION_SITE_URL);
  });

  it("prefers configured canonical production URL and strips trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://snhu-tools.vercel.app/";
    expect(getSiteUrl()).toBe("https://snhu-tools.vercel.app");
  });

  it("prefers SITE_URL when NEXT_PUBLIC_SITE_URL is absent", () => {
    process.env.SITE_URL = "https://snhu-tools.vercel.app/";
    expect(getSiteUrl()).toBe("https://snhu-tools.vercel.app");
  });

  it("rejects arbitrary Vercel preview deployment hosts and falls back to canonical", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://snhu-tools-abc123-andrewtryder.vercel.app";
    expect(getSiteUrl()).toBe("https://snhu-tools.vercel.app");
  });

  it("accepts a custom non-preview production host", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tools.example.com/";
    expect(getSiteUrl()).toBe("https://tools.example.com");
  });

  it("falls back safely when configured URL is malformed", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not-a-valid-url";
    expect(getSiteUrl()).toBe("https://snhu-tools.vercel.app");
  });
});
