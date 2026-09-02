import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCanonicalHostRedirect } from "@/lib/canonicalHost";

describe("resolveCanonicalHostRedirect", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("skips non-production deployments for any host", () => {
    expect(
      resolveCanonicalHostRedirect({
        host: "snhu-tools-g4mrfmu6p-andrewtryder.vercel.app",
        proto: "https",
        pathname: "/programs",
        search: "",
        isProduction: false,
      }),
    ).toBeNull();

    expect(
      resolveCanonicalHostRedirect({
        host: "snhu-degreemap.vercel.app",
        proto: "https",
        pathname: "/programs",
        search: "",
        isProduction: false,
      }),
    ).toBeNull();
  });

  it("returns null when host and scheme already match canonical production", () => {
    expect(
      resolveCanonicalHostRedirect({
        host: "snhu-tools.vercel.app",
        proto: "https",
        pathname: "/programs",
        search: "",
        isProduction: true,
      }),
    ).toBeNull();
  });

  it("redirects legacy Degree Map host to canonical snhu-tools production origin", () => {
    expect(
      resolveCanonicalHostRedirect({
        host: "snhu-degreemap.vercel.app",
        proto: "https",
        pathname: "/programs",
        search: "",
        isProduction: true,
      }),
    ).toBe("https://snhu-tools.vercel.app/programs");
  });

  it("redirects arbitrary other hosts preserving path and query to canonical origin", () => {
    expect(
      resolveCanonicalHostRedirect({
        host: "arbitrary-other.vercel.app",
        proto: "https",
        pathname: "/courses/CS210",
        search: "?filter=true",
        isProduction: true,
      }),
    ).toBe("https://snhu-tools.vercel.app/courses/CS210?filter=true");
  });

  it("forces HTTPS when proto is http", () => {
    expect(
      resolveCanonicalHostRedirect({
        host: "snhu-tools.vercel.app",
        proto: "http",
        pathname: "/about",
        search: "",
        isProduction: true,
      }),
    ).toBe("https://snhu-tools.vercel.app/about");
  });

  it("redirects www to the preferred apex host when a custom domain is configured", () => {
    expect(
      resolveCanonicalHostRedirect({
        host: "www.degreemap.example.com",
        proto: "https",
        pathname: "/programs",
        search: "",
        isProduction: true,
        preferredOrigin: "https://degreemap.example.com",
      }),
    ).toBe("https://degreemap.example.com/programs");
  });

  it("preserves pathname and search on custom host redirects", () => {
    expect(
      resolveCanonicalHostRedirect({
        host: "www.degreemap.example.com",
        proto: "https",
        pathname: "/programs",
        search: "?level=bachelor",
        isProduction: true,
        preferredOrigin: "https://degreemap.example.com",
      }),
    ).toBe("https://degreemap.example.com/programs?level=bachelor");
  });
});
