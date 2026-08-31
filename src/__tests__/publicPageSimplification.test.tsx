import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import AboutPage from "@/app/about/page";
import { filterProgramsByLevel } from "@/lib/programLevelCategories";
import { ProgramLevelFilterPills } from "@/components/programs/ProgramDirectory";
import { fixturePrograms } from "@/data/fixturePrograms";
import { getProgramLevelCategory } from "@/lib/programLevelCategories";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

describe("public page simplification", () => {
  it("keeps the homepage title and removes promotional hero content and statistics", async () => {
    render(await HomePage());

    expect(screen.getByRole("heading", { name: "SNHU Degree Map", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Explore interactive prerequisite graphs/i)).toBeInTheDocument();
    for (const removedText of [
      "Unofficial SNHU Degree & Prerequisite Visualizer",
      "Prototype Notice:",
      "View Computer Science (BS) Map",
      "Explore All Programs",
      "Available Programs",
      "Catalog Year",
      "React Flow + Dagre",
      "Dual View Mode",
      "Browse Degree Programs",
    ]) {
      expect(screen.queryByText(removedText)).not.toBeInTheDocument();
    }
  });

  it("curates bachelor homepage cards from the popular list", async () => {
    render(await HomePage());

    expect(
      screen.getByRole("heading", { name: "Popular Bachelor’s Programs", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all programs" })).toHaveAttribute("href", "/programs");
    expect(screen.queryByRole("link", { name: "Browse all bachelor’s programs" })).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: /Business Administration/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Computer Science/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Psychology/i, level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Cybersecurity/i, level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByText("2025-2026")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Computer Science/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("N/A Total Credits")).not.toBeInTheDocument();

    for (const program of fixturePrograms) {
      if (getProgramLevelCategory(program) === "bachelor") continue;
      expect(screen.queryByRole("heading", { name: program.title, level: 3 })).not.toBeInTheDocument();
    }
  });

  it("keeps concise student-facing About content without status or methodology cards", async () => {
    render(await AboutPage());

    expect(screen.getByRole("heading", { name: "Why This Site Exists" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How It Works" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Important Disclaimer" })).toBeInTheDocument();
    expect(screen.queryByText("Data Methodology")).not.toBeInTheDocument();
    expect(screen.queryByText("System & Data Status")).not.toBeInTheDocument();
  });

  it("uses conservative, shared directory categories", () => {
    expect(getProgramLevelCategory({ credential: "Bachelor of Arts", degreeLevel: "BA" })).toBe("bachelor");
    expect(getProgramLevelCategory({ credential: "Bachelor of Science", degreeLevel: "BS" })).toBe("bachelor");
    expect(getProgramLevelCategory({ credential: "Master of Science", degreeLevel: "MS" })).toBe("graduate");
    expect(getProgramLevelCategory({ credential: "Graduate Certificate", degreeLevel: "Graduate Certificate" })).toBe(
      "certificate",
    );
    expect(getProgramLevelCategory({ credential: "Unclassified credential", degreeLevel: "Other" })).toBe("other");

    expect(
      filterProgramsByLevel(fixturePrograms, "bachelor").every(
        (program) => getProgramLevelCategory(program) === "bachelor",
      ),
    ).toBe(true);
  });

  it("renders URL-driven directory level pills", () => {
    render(<ProgramLevelFilterPills level="bachelor" />);

    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/programs");
    expect(screen.getByRole("link", { name: "Associate" })).toHaveAttribute("href", "/programs/associate");
    expect(screen.getByRole("link", { name: "Bachelor’s (BA & BS)" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Graduate (MA/MS)" })).toHaveAttribute("href", "/programs/graduate");
    expect(screen.getByRole("link", { name: "Certificate" })).toHaveAttribute("href", "/programs/certificates");
  });
});
