import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import AssociatePage, { generateMetadata as associateMetadata } from "@/app/programs/associate/page";
import BachelorsPage, { generateMetadata as bachelorsMetadata } from "@/app/programs/bachelors/page";
import GraduatePage, { generateMetadata as graduateMetadata } from "@/app/programs/graduate/page";
import CertificatesPage, { generateMetadata as certificatesMetadata } from "@/app/programs/certificates/page";
import { filterProgramsByLevel, getCategoryByPath, getPathForCategory } from "@/lib/programLevelCategories";
import { resolveProgramsRedirect } from "@/lib/programsUrlCanonical";
import { fixturePrograms } from "@/data/fixturePrograms";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/programs/bachelors",
}));

describe("program category landing pages", () => {
  it("maps public paths to internal categories", () => {
    expect(getCategoryByPath("bachelors")?.category).toBe("bachelor");
    expect(getCategoryByPath("certificates")?.category).toBe("certificate");
    expect(getPathForCategory("bachelor")).toBe("bachelors");
    expect(getPathForCategory("certificate")).toBe("certificates");
  });

  it("emits unique metadata and self-canonicals for each category path", async () => {
    const associate = await associateMetadata();
    const bachelors = await bachelorsMetadata();
    const graduate = await graduateMetadata();
    const certificates = await certificatesMetadata();

    expect(associate).toMatchObject({
      title: "Associate Degree Programs",
      alternates: { canonical: "/programs/associate" },
    });
    expect(bachelors).toMatchObject({
      title: "Bachelor’s Degree Programs",
      alternates: { canonical: "/programs/bachelors" },
    });
    expect(graduate).toMatchObject({
      title: "Graduate Degree Programs",
      alternates: { canonical: "/programs/graduate" },
    });
    expect(certificates).toMatchObject({
      title: "Certificate Programs",
      alternates: { canonical: "/programs/certificates" },
    });

    const titles = [associate.title, bachelors.title, graduate.title, certificates.title];
    expect(new Set(titles).size).toBe(4);
  });

  it("lists matching bachelor programs as crawlable links", async () => {
    const expectedCount = filterProgramsByLevel(fixturePrograms, "bachelor").length;
    render(await BachelorsPage());

    expect(screen.getByRole("heading", { name: "Bachelor’s Degree Programs", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Showing ${expectedCount} programs`, "i"))).toBeInTheDocument();

    const programLinks = screen.getAllByRole("link").filter((link) => {
      const href = link.getAttribute("href") || "";
      return /^\/programs\/(?!associate$|bachelors$|graduate$|certificates$)[^/]+$/.test(href);
    });
    const uniqueHrefs = new Set(programLinks.map((link) => link.getAttribute("href")));
    expect(uniqueHrefs.size).toBe(expectedCount);
    expect(screen.getByRole("link", { name: "All programs" })).toHaveAttribute("href", "/programs");
    expect(screen.getByRole("link", { name: "Associate Degree Programs" })).toHaveAttribute(
      "href",
      "/programs/associate",
    );
  });

  it("renders the other category pages with category-specific headings", async () => {
    render(await AssociatePage());
    expect(screen.getByRole("heading", { name: "Associate Degree Programs", level: 1 })).toBeInTheDocument();

    render(await GraduatePage());
    expect(screen.getByRole("heading", { name: "Graduate Degree Programs", level: 1 })).toBeInTheDocument();

    render(await CertificatesPage());
    expect(screen.getByRole("heading", { name: "Certificate Programs", level: 1 })).toBeInTheDocument();
  });

  it("configures permanent redirects from legacy singular category paths", () => {
    const configSource = readFileSync(join(process.cwd(), "next.config.js"), "utf8");
    expect(configSource).toContain('destination: "/programs/bachelors"');
    expect(configSource).toContain('destination: "/programs/certificates"');
    expect(configSource).toContain("permanent: true");
  });

  it("canonicalizes legacy ?level= and other query filters via redirect helper", () => {
    expect(resolveProgramsRedirect("/programs", new URLSearchParams("level=bachelor"))).toBe(
      "/programs/bachelors",
    );
    expect(resolveProgramsRedirect("/programs", new URLSearchParams("sort=name"))).toBe("/programs");
    expect(resolveProgramsRedirect("/programs", new URLSearchParams("search=computer"))).toBe(
      "/programs",
    );

    const proxySource = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxySource).toContain("resolveProgramsRedirect");
    expect(proxySource).toContain("resolveCanonicalHostRedirect");
    expect(proxySource).toContain("308");
  });
});
