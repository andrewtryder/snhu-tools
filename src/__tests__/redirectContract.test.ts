import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "@/proxy";
import nextConfig from "../../next.config.js";

describe("Redirect Contract & Proxy Scope", () => {
  it("scopes proxy matcher strictly to /programs to prevent unnecessary Fluid Compute on other routes", () => {
    expect(config.matcher).toEqual(["/programs"]);
  });

  describe("Programs query canonicalization via proxy", () => {
    function createRequest(url: string, host = "snhu-tools.vercel.app") {
      return new NextRequest(url, {
        headers: { host },
      });
    }

    it("redirects /programs?level=associate to /programs/associate with search cleared", () => {
      const req = createRequest("https://snhu-tools.vercel.app/programs?level=associate");
      const res = proxy(req);
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe("https://snhu-tools.vercel.app/programs/associate");
    });

    it("redirects /programs?level=bachelor to /programs/bachelors with search cleared", () => {
      const req = createRequest("https://snhu-tools.vercel.app/programs?level=bachelor");
      const res = proxy(req);
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe("https://snhu-tools.vercel.app/programs/bachelors");
    });

    it("redirects /programs?level=graduate to /programs/graduate with search cleared", () => {
      const req = createRequest("https://snhu-tools.vercel.app/programs?level=graduate");
      const res = proxy(req);
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe("https://snhu-tools.vercel.app/programs/graduate");
    });

    it("redirects /programs?level=certificate to /programs/certificates with search cleared", () => {
      const req = createRequest("https://snhu-tools.vercel.app/programs?level=certificate");
      const res = proxy(req);
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe("https://snhu-tools.vercel.app/programs/certificates");
    });

    it("redirects /programs?level=all to clean /programs with search cleared", () => {
      const req = createRequest("https://snhu-tools.vercel.app/programs?level=all");
      const res = proxy(req);
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe("https://snhu-tools.vercel.app/programs");
    });

    it("redirects /programs?level=garbage to clean /programs with search cleared", () => {
      const req = createRequest("https://snhu-tools.vercel.app/programs?level=garbage");
      const res = proxy(req);
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe("https://snhu-tools.vercel.app/programs");
    });

    it("allows clean /programs without search params to pass through without redirect", () => {
      const req = createRequest("https://snhu-tools.vercel.app/programs");
      const res = proxy(req);
      // NextResponse.next() has no 308 redirect location
      expect(res.headers.get("location")).toBeNull();
      expect(res.status).toBe(200);
    });

    it("preserves Preview deployment hostname during query canonicalization without redirecting to production", () => {
      const previewHost = "snhu-tools-git-feat-test-andrewtryder.vercel.app";
      const req = createRequest(`https://${previewHost}/programs?level=bachelor`, previewHost);
      const res = proxy(req);
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe(`https://${previewHost}/programs/bachelors`);
      expect(res.headers.get("location")).not.toContain("snhu-tools.vercel.app");
    });
  });

  describe("Existing static redirects in next.config.js", () => {
    it("contains permanent 308 redirects without loops", async () => {
      const redirects = await nextConfig.redirects();
      expect(redirects).toBeDefined();

      const bachelorRedirect = redirects.find((r: { source: string }) => r.source === "/programs/bachelor");
      expect(bachelorRedirect).toEqual({
        source: "/programs/bachelor",
        destination: "/programs/bachelors",
        permanent: true,
      });

      const certificateRedirect = redirects.find(
        (r: { source: string }) => r.source === "/programs/certificate",
      );
      expect(certificateRedirect).toEqual({
        source: "/programs/certificate",
        destination: "/programs/certificates",
        permanent: true,
      });

      const courseRedirect = redirects.find((r: { source: string }) => r.source === "/course/:id");
      expect(courseRedirect).toEqual({
        source: "/course/:id",
        destination: "/courses/:id",
        permanent: true,
      });

      // Confirm no source matches its destination (no direct loops)
      for (const rule of redirects) {
        expect(rule.source).not.toBe(rule.destination);
      }
    });
  });
});
