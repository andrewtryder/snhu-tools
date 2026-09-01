import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProgramRequirementsContent } from "@/app/programs/[slug]/requirements/page";
import { ProgramDetailContent } from "@/app/programs/[slug]/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/programs/computer-science-bs/requirements",
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
      <p>0 of 0 identified program courses have known transfer listings.</p>
    </div>
  ),
}));

describe("Program requirements page", () => {
  it("renders crawlable requirement groups, nested items, and course inventory", async () => {
    const element = await ProgramRequirementsContent({ slug: "computer-science-bs" });
    render(element);

    expect(
      await screen.findByRole("heading", { name: "Computer Science BS Degree Requirements", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Requirement Groups", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Course Inventory", level: 2 })).toBeInTheDocument();
    expect(
      screen.getByText(/The Computer Science program contains \d+ identified courses across \d+ requirement categories/),
    ).toBeInTheDocument();
    expect(screen.getByText(/\d+ known course relationships/)).toBeInTheDocument();

    expect(screen.getByText("Cornerstone Math (CMAT)")).toBeInTheDocument();
    expect(screen.getByText("Choose 1 of the following")).toBeInTheDocument();
    expect(screen.getByText("MAT 241: Modern Statistics")).toBeInTheDocument();

    const inventory = screen.getByRole("table", {
      name: /Courses in this degree program with known prerequisite links/i,
    });
    expect(within(inventory).getByRole("link", { name: "MAT 140" })).toHaveAttribute(
      "href",
      "/courses/MAT140",
    );
    expect(within(inventory).getByRole("link", { name: "IT 140" })).toHaveAttribute(
      "href",
      "/courses/IT140",
    );
    expect(within(inventory).getByText("Precalculus")).toBeInTheDocument();
    expect(within(inventory).getByText("Introduction to Scripting")).toBeInTheDocument();
    const cs210Header = within(inventory).getByRole("rowheader", { name: /CS 210/ });
    const cs210Row = cs210Header.closest("tr");
    expect(cs210Row).toBeTruthy();
    expect(within(cs210Row!).getByText(/Intro to Software Development/)).toBeInTheDocument();
    expect(within(cs210Row!).getByText(/IT 145/)).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Back to interactive degree map/i })).toHaveAttribute(
      "href",
      "/programs/computer-science-bs",
    );
  }, 15000);

  it("keeps nested requirement-tree listings off the simplified program map page", async () => {
    const element = await ProgramDetailContent({ slug: "computer-science-bs" });
    render(element);

    expect(await screen.findByRole("heading", { name: "Computer Science", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View full courses and requirements/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View every course and requirement/i })).not.toBeInTheDocument();
    expect(screen.getByText("Program Requirement Groups & Course Listing")).toBeInTheDocument();
    expect(screen.queryByText("MAT 241: Modern Statistics")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose 1 of the following")).not.toBeInTheDocument();
    expect(screen.queryByText("Complete catalog rule text")).not.toBeInTheDocument();
  }, 15000);
});
