import fs from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

describe("homepage degree map preview", () => {
  it("renders the product-preview section between the hero and popular programs", async () => {
    const { container } = render(await HomePage());

    const hero = screen.getByRole("heading", { name: "SNHU Degree Map", level: 1 });
    const preview = screen.getByRole("heading", {
      name: "See how a degree fits together",
      level: 2,
    });
    const popular = screen.getByRole("heading", {
      name: "Popular Bachelor’s Programs",
      level: 2,
    });

    expect(
      hero.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      preview.compareDocumentPosition(popular) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.getByText("What Degree Map Shows")).toBeInTheDocument();
    expect(
      screen.getByText("Follow known prerequisite and corequisite relationships."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Understand general education, major, core, and elective requirements.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Open course details and current transfer-equivalency listings."),
    ).toBeInTheDocument();

    const previewImage = screen.getByRole("img", {
      name: "Computer Science degree map showing branching prerequisite relationships between programming, mathematics, systems, and capstone courses.",
    });
    expect(decodeURIComponent(previewImage.getAttribute("src") ?? "")).toContain(
      "/home/computer-science-degree-map-preview.webp",
    );

    const figure = previewImage.closest("figure");
    expect(figure).not.toBeNull();
    expect(
      within(figure as HTMLElement).getByText(
        "Example: Computer Science BS prerequisite relationships",
      ),
    ).toBeInTheDocument();

    const exploreLink = screen.getByRole("link", {
      name: /Explore the Computer Science BS map/i,
    });
    expect(exploreLink).toHaveAttribute("href", "/programs/computer-science-bs");

    expect(
      screen.getByRole("heading", { name: "Popular Bachelor’s Programs", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(0);

    const pageSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/page.tsx"),
      "utf8",
    );
    expect(pageSource).not.toMatch(/DegreeMapGraph|DynamicDegreeMapGraph|@xyflow\/react|html-to-image/);
    expect(pageSource).toMatch(/from "next\/image"/);
    expect(pageSource.toLowerCase()).not.toMatch(/snhu.?logo|logo\.svg|logo\.png/);
    expect(container.querySelectorAll("img[alt*='logo' i]")).toHaveLength(0);
  });
});
