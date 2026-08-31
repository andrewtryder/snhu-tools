import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
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
  ProgramTransferCoverage: () => (
    <div>
      <h2>Transfer Integration</h2>
      <p>2 of 10 identified program courses have known transfer listings.</p>
      <a
        href="https://snhu-transfers.vercel.app/courses/CS210"
        aria-label="View transfer equivalencies for CS 210"
      >
        CS 210
      </a>
    </div>
  ),
}));

describe("Computer Science Program Page", () => {
  it("renders catalog, transfer, credit summaries, and graph without duplicate about content", async () => {
    const element = await ProgramDetailContent({ slug: "computer-science-bs" });
    render(element);

    expect(await screen.findByRole("heading", { name: "Computer Science", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Bachelor of Science in Computer Science")).toBeInTheDocument();

    const catalogLink = screen.getByRole("link", { name: /Official SNHU Catalog/i });
    expect(catalogLink).toHaveAttribute(
      "href",
      "https://www.snhu.edu/admission/academic-catalogs#/programs/V1S14E8tg/none",
    );
    expect(catalogLink.getAttribute("href")).not.toMatch(/\/api\//);
    expect(catalogLink.getAttribute("href")).not.toMatch(/kuali\.co/);

    expect(
      await screen.findByRole("heading", { name: "Transfer Integration", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\d+ of \d+ identified program courses have known transfer listings\./i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/required courses have known transfer equivalencies/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Explore All Options on snhu-transfers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Transfer Evaluation Disclaimer/i)).not.toBeInTheDocument();

    const transferLink = screen.getByRole("link", { name: "View transfer equivalencies for CS 210" });
    expect(transferLink).toHaveAttribute("href", "https://snhu-transfers.vercel.app/courses/CS210");

    expect(screen.getByText("Program Requirement Groups & Course Listing")).toBeInTheDocument();
    expect(screen.getByText("Credit totals by degree requirement category.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View full courses and requirements/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View every course and requirement/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Related .* Programs/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("42 Total Credits").length).toBeGreaterThan(0);
    expect(screen.queryByText("Complete all of the following")).not.toBeInTheDocument();
    expect(screen.queryByText("Complete catalog rule text")).not.toBeInTheDocument();
    expect(screen.queryByText(/About the Computer Science Degree Program/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Potential Career Pathways")).not.toBeInTheDocument();

    // Nested requirement-tree listings and representative course preview stay off the map page.
    expect(screen.queryByText("MAT 241: Modern Statistics")).not.toBeInTheDocument();
    expect(screen.queryByText("Course listings mapped in interactive degree graph.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Courses in the .* Program/i, level: 2 }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Introduction to Scripting")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "IT 140" })).not.toBeInTheDocument();

    // Graph loads through next/dynamic wrapper (client-only); assert mount point, not heavy canvas.
    expect(screen.getByTestId("dynamic-degree-map")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Interactive Prerequisite Map", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Search courses in degree map/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Search map/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show degree requirements/i })).not.toBeInTheDocument();
  }, 15000);

  it("triggers 404 for invalid program slug", async () => {
    await expect(async () => {
      await ProgramDetailContent({ slug: "non-existent-program" });
    }).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
