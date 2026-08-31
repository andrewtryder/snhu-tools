import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProgramDetailContent } from "@/app/programs/[slug]/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/programs/computer-science-bs",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/components/graph/DynamicDegreeMapGraph", () => ({
  DynamicDegreeMapGraph: () => <div data-testid="dynamic-degree-map">map</div>,
}));

vi.mock("@/components/programs/ProgramTransferCoverage", () => ({
  ProgramTransferCoverage: () => <div data-testid="transfer-coverage">transfer</div>,
}));

describe("program detail SEO content", () => {
  it("includes enriched JSON-LD without related-program UI", async () => {
    const element = await ProgramDetailContent({ slug: "computer-science-bs" });
    const { container } = render(element);

    const jsonLdScript = container.querySelector('script[type="application/ld+json"]');
    expect(jsonLdScript).toBeTruthy();
    const jsonLd = JSON.parse(jsonLdScript!.textContent || "{}");
    const graph = jsonLd["@graph"] as Array<Record<string, unknown>>;

    const webPage = graph.find((node) => node["@type"] === "WebPage");
    const program = graph.find((node) => node["@type"] === "EducationalOccupationalProgram");

    expect(webPage?.mainEntity).toEqual({ "@id": expect.stringContaining("#program") });
    expect(webPage?.url).toContain("/programs/computer-science-bs");
    expect(program?.isBasedOn).toContain("academic-catalogs#/programs/V1S14E8tg/none");
    expect(program?.url).toContain("/programs/computer-science-bs");

    expect(await screen.findByTestId("dynamic-degree-map")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Related .* Programs/i })).not.toBeInTheDocument();
  }, 15000);
});
