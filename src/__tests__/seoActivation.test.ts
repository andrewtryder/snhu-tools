import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { metadata as rootMetadata } from "@/app/layout";
import { siteConfig } from "@/lib/site";
import { metadata as coursesMetadata } from "@/app/courses/page";
import { generateMetadata as generateCourseMetadata } from "@/app/courses/[id]/page";
import { metadata as transfersMetadata } from "@/app/transfers/page";
import { metadata as browseMetadata } from "@/app/transfers/browse/page";
import { metadata as transferCoursesMetadata } from "@/app/transfers/courses/page";
import { generateMetadata as generateTransferCourseMetadata } from "@/app/transfers/courses/[courseNumber]/page";
import { metadata as subjectsMetadata } from "@/app/transfers/subjects/page";
import { generateMetadata as generateSubjectMetadata } from "@/app/transfers/subjects/[subject]/page";
import { metadata as organizationsMetadata } from "@/app/transfers/organizations/page";
import { generateMetadata as generateOrganizationMetadata } from "@/app/transfers/organizations/[organization]/page";
import { metadata as levelsMetadata } from "@/app/transfers/levels/page";
import { generateMetadata as generateLevelMetadata } from "@/app/transfers/levels/[level]/page";
import { generateMetadata as generateSearchMetadata } from "@/app/search/page";
import sitemap from "@/app/sitemap";
import { PRODUCTION_SITE_URL } from "@/lib/siteUrl";

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter", className: "font-inter" }),
  Geist: () => ({ variable: "--font-geist", className: "font-geist" }),
}));

// Mock DB boundaries for courses
vi.mock("@/features/courses/lib/courses", () => ({
  getCourseById: vi.fn((id: string) => {
    if (id === "CS210") {
      return Promise.resolve({
        id: "CS210",
        title: "Programming Languages",
        subject_prefix: "CS",
        course_number: "210",
      });
    }
    return Promise.resolve(null);
  }),
  getSitemapCatalogData: vi.fn(() =>
    Promise.resolve({
      courseIds: ["CS210", "CS330", "IT140"],
      catalogLastModified: new Date("2026-08-30T03:00:00Z"),
    }),
  ),
}));

// Mock DB boundaries for transfers
vi.mock("@/features/transfers/lib/seoQueries", () => ({
  getRowsByCourseNumber: vi.fn((courseNumber: string) => {
    if (courseNumber.toUpperCase() === "ACC201") {
      return Promise.resolve([
        {
          subjectPrefix: "ACC",
          courseNumber: "ACC201",
          title: "Financial Accounting",
          pid: "1",
          eligibilityTimeframe: "Active",
          groupFilter2Name: "Sophia Learning",
          academicLevel: "Undergraduate",
          coursePID: "c1",
        },
      ]);
    }
    return Promise.resolve([]);
  }),
  resolveSubjectBySlug: vi.fn((slug: string) => {
    if (slug === "cs") return Promise.resolve("Computer Science (CS)");
    return Promise.resolve(null);
  }),
  resolveOrganizationBySlug: vi.fn((slug: string) => {
    if (slug === "sophia-learning") return Promise.resolve("Sophia Learning");
    return Promise.resolve(null);
  }),
  resolveLevelBySlug: vi.fn((slug: string) => {
    if (slug === "undergraduate") return Promise.resolve("Undergraduate");
    return Promise.resolve(null);
  }),
  getTransferSitemapData: vi.fn(() =>
    Promise.resolve({
      courseNumbers: ["ACC201", "IT140"],
      subjects: ["Computer Science (CS)", "Information Technology (IT)"],
      organizations: ["Sophia Learning", "Study.com"],
      levels: ["Undergraduate", "Graduate"],
      lastModified: new Date("2026-08-30T04:00:00Z"),
    }),
  ),
}));

// Mock serverData for programs
vi.mock("@/lib/serverData", () => ({
  getCatalogLastUpdated: vi.fn(() => Promise.resolve(new Date("2026-08-30T05:00:00Z"))),
  getSitemapPrograms: vi.fn(() =>
    Promise.resolve([
      { slug: "accounting-bs", updatedAt: new Date("2026-08-25T00:00:00Z") },
      { slug: "computer-science-bs", updatedAt: new Date("2026-08-25T00:00:00Z") },
    ]),
  ),
}));

describe("Phase 7 SEO & Indexing Activation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("Root Site Branding", () => {
    it("reflects SNHU Tools in siteConfig", () => {
      expect(siteConfig.name).toBe("SNHU Tools");
      expect(siteConfig.description).toContain("unofficial SNHU degree programs");
      expect(siteConfig.description).toContain("course prerequisites");
      expect(siteConfig.description).toContain("transfer equivalencies");
    });

    it("reflects SNHU Tools in root layout metadata", () => {
      expect(rootMetadata.title).toEqual({
        default: "SNHU Tools",
        template: "%s | SNHU Tools",
      });
      expect(rootMetadata.openGraph?.title).toBe("SNHU Tools");
      expect(rootMetadata.twitter?.title).toBe("SNHU Tools");
      expect(rootMetadata.verification?.google).toBe("WwHM9rI4JHcup_jIeQIw3OfnUDJzydWo-3RdLQnNHnM");
    });
  });

  describe("Course Metadata Indexability", () => {
    it("removes temporary noindex from courses root directory", () => {
      expect(coursesMetadata.robots).toBeUndefined();
      expect(coursesMetadata.alternates?.canonical).toBe("/courses");
    });

    it("removes temporary noindex from valid course detail page", async () => {
      const meta = await generateCourseMetadata({ params: Promise.resolve({ id: "CS210" }) });
      expect(meta.robots).toBeUndefined();
      expect(meta.title).toContain("CS210");
      expect(meta.alternates?.canonical).toBe("/courses/CS210");
    });

    it("retains noindex on invalid / not-found course detail page", async () => {
      const meta = await generateCourseMetadata({ params: Promise.resolve({ id: "INVALID999" }) });
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(meta.title).toBe("Course Not Found");
    });
  });

  describe("Transfer Metadata Indexability", () => {
    it("removes temporary noindex from transfers root", () => {
      expect(transfersMetadata.robots).toBeUndefined();
      expect(transfersMetadata.alternates?.canonical).toBe(`${PRODUCTION_SITE_URL}/transfers`);
    });

    it("removes temporary noindex from transfers browse", () => {
      expect(browseMetadata.robots).toBeUndefined();
      expect(browseMetadata.alternates?.canonical).toBe(`${PRODUCTION_SITE_URL}/transfers/browse`);
    });

    it("removes temporary noindex from transfers courses directory", () => {
      expect(transferCoursesMetadata.robots).toBeUndefined();
      expect(transferCoursesMetadata.alternates?.canonical).toBe(`${PRODUCTION_SITE_URL}/transfers/courses`);
    });

    it("removes temporary noindex from valid transfer course detail", async () => {
      const meta = await generateTransferCourseMetadata({ params: Promise.resolve({ courseNumber: "ACC201" }) });
      expect(meta.robots).toBeUndefined();
      expect(meta.title).toContain("ACC201");
      expect(meta.alternates?.canonical).toBe(`${PRODUCTION_SITE_URL}/transfers/courses/acc201`);
    });

    it("retains noindex on not-found transfer course", async () => {
      const meta = await generateTransferCourseMetadata({ params: Promise.resolve({ courseNumber: "UNKNOWN999" }) });
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(meta.title).toContain("Not Found");
    });

    it("removes temporary noindex from transfers subjects directory and valid subject", async () => {
      expect(subjectsMetadata.robots).toBeUndefined();
      const meta = await generateSubjectMetadata({ params: Promise.resolve({ subject: "cs" }) });
      expect(meta.robots).toBeUndefined();
      expect(meta.title).toContain("Computer Science");
      expect(meta.alternates?.canonical).toBe(`${PRODUCTION_SITE_URL}/transfers/subjects/cs`);
    });

    it("retains noindex on not-found transfer subject", async () => {
      const meta = await generateSubjectMetadata({ params: Promise.resolve({ subject: "nonexistent" }) });
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(meta.title).toContain("Not Found");
    });

    it("removes temporary noindex from transfers organizations directory and valid organization", async () => {
      expect(organizationsMetadata.robots).toBeUndefined();
      const meta = await generateOrganizationMetadata({ params: Promise.resolve({ organization: "sophia-learning" }) });
      expect(meta.robots).toBeUndefined();
      expect(meta.title).toContain("Sophia Learning");
      expect(meta.alternates?.canonical).toBe(`${PRODUCTION_SITE_URL}/transfers/organizations/sophia-learning`);
    });

    it("retains noindex on not-found transfer organization", async () => {
      const meta = await generateOrganizationMetadata({ params: Promise.resolve({ organization: "nonexistent" }) });
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(meta.title).toContain("Not Found");
    });

    it("removes temporary noindex from transfers levels directory and valid level", async () => {
      expect(levelsMetadata.robots).toBeUndefined();
      const meta = await generateLevelMetadata({ params: Promise.resolve({ level: "undergraduate" }) });
      expect(meta.robots).toBeUndefined();
      expect(meta.title).toContain("Undergraduate");
      expect(meta.alternates?.canonical).toBe(`${PRODUCTION_SITE_URL}/transfers/levels/undergraduate`);
    });

    it("retains noindex on not-found transfer level", async () => {
      const meta = await generateLevelMetadata({ params: Promise.resolve({ level: "nonexistent" }) });
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(meta.title).toContain("Not Found");
    });
  });

  describe("Search Metadata Safety", () => {
    it("preserves intentional noindex, follow on search page", async () => {
      const meta = await generateSearchMetadata({ searchParams: Promise.resolve({ q: "CS210" }) });
      expect(meta.robots).toEqual({
        index: false,
        follow: true,
      });
    });
  });

  describe("Consolidated Sitemap Generation", () => {
    it("generates sitemap entries across Programs, Courses, and Transfers", async () => {
      const entries = await sitemap();
      const urls = entries.map((e) => e.url);

      // Core & Hub URLs
      expect(urls).toContain(PRODUCTION_SITE_URL);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/programs`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/courses`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/browse`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/courses`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/subjects`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/organizations`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/levels`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/about`);

      // Dynamic Programs
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/programs/accounting-bs`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/programs/accounting-bs/requirements`);

      // Dynamic Courses
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/courses/CS210`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/courses/CS330`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/courses/IT140`);

      // Dynamic Transfers
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/courses/acc201`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/courses/it140`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/subjects/computer-science-cs`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/organizations/sophia-learning`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/levels/undergraduate`);

      // Guarantees: No legacy hosts, no search, no api, no queries, no duplicates
      expect(urls.some((u) => u.includes("snhu-courses"))).toBe(false);
      expect(urls.some((u) => u.includes("snhu-degreemap"))).toBe(false);
      expect(urls.some((u) => u.includes("snhu-transfers"))).toBe(false);
      expect(urls.some((u) => u.includes("/search"))).toBe(false);
      expect(urls.some((u) => u.includes("/api/"))).toBe(false);
      expect(urls.some((u) => u.includes("?"))).toBe(false);

      const uniqueUrls = new Set(urls);
      expect(uniqueUrls.size).toBe(urls.length);

      // Timestamps check
      for (const entry of entries) {
        if (entry.lastModified) {
          expect(entry.lastModified instanceof Date).toBe(true);
          expect(Number.isNaN(entry.lastModified.getTime())).toBe(false);
        }
      }
    });

    it("isolates dynamic Program failure and keeps Courses and Transfers", async () => {
      const { getSitemapPrograms } = await import("@/lib/serverData");
      vi.mocked(getSitemapPrograms).mockRejectedValueOnce(new Error("Programs DB timeout"));

      const entries = await sitemap();
      const urls = entries.map((e) => e.url);

      expect(urls).toContain(`${PRODUCTION_SITE_URL}/courses`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/courses/CS210`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/courses/acc201`);
      expect(urls).not.toContain(`${PRODUCTION_SITE_URL}/programs/accounting-bs`);
    });

    it("isolates dynamic Course failure and keeps Programs and Transfers", async () => {
      const { getSitemapCatalogData } = await import("@/features/courses/lib/courses");
      vi.mocked(getSitemapCatalogData).mockRejectedValueOnce(new Error("Courses DB timeout"));

      const entries = await sitemap();
      const urls = entries.map((e) => e.url);

      expect(urls).toContain(`${PRODUCTION_SITE_URL}/programs/accounting-bs`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers/courses/acc201`);
      expect(urls).not.toContain(`${PRODUCTION_SITE_URL}/courses/CS210`);
    });

    it("isolates dynamic Transfer failure and keeps Programs and Courses", async () => {
      const { getTransferSitemapData } = await import("@/features/transfers/lib/seoQueries");
      vi.mocked(getTransferSitemapData).mockRejectedValueOnce(new Error("Transfers DB timeout"));

      const entries = await sitemap();
      const urls = entries.map((e) => e.url);

      expect(urls).toContain(`${PRODUCTION_SITE_URL}/programs/accounting-bs`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/courses/CS210`);
      expect(urls).not.toContain(`${PRODUCTION_SITE_URL}/transfers/courses/acc201`);
    });

    it("returns static hub routes when all dynamic queries fail", async () => {
      const { getSitemapPrograms } = await import("@/lib/serverData");
      const { getSitemapCatalogData } = await import("@/features/courses/lib/courses");
      const { getTransferSitemapData } = await import("@/features/transfers/lib/seoQueries");

      vi.mocked(getSitemapPrograms).mockRejectedValueOnce(new Error("Programs failure"));
      vi.mocked(getSitemapCatalogData).mockRejectedValueOnce(new Error("Courses failure"));
      vi.mocked(getTransferSitemapData).mockRejectedValueOnce(new Error("Transfers failure"));

      const entries = await sitemap();
      const urls = entries.map((e) => e.url);

      expect(urls).toContain(PRODUCTION_SITE_URL);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/programs`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/courses`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/transfers`);
      expect(urls).toContain(`${PRODUCTION_SITE_URL}/about`);
      expect(urls).not.toContain(`${PRODUCTION_SITE_URL}/programs/accounting-bs`);
      expect(urls).not.toContain(`${PRODUCTION_SITE_URL}/courses/CS210`);
      expect(urls).not.toContain(`${PRODUCTION_SITE_URL}/transfers/courses/acc201`);
    });
  });
});
