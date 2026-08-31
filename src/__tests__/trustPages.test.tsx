import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MethodologyPage from "@/app/methodology/page";
import DataStatusPage from "@/app/data-status/page";
import AboutPage from "@/app/about/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/about",
}));

describe("Trust & Methodology Pages", () => {
  it("renders Data Methodology documentation page", () => {
    render(<MethodologyPage />);
    expect(screen.getByRole("heading", { name: /Data Processing & Graph Analysis Methodology/i })).toBeInTheDocument();
    expect(screen.getByText(/Zero Requirement Invention/i)).toBeInTheDocument();
  }, 15000);

  it("renders Data Status health dashboard page", async () => {
    const page = await DataStatusPage();
    render(page);

    expect(screen.getByRole("heading", { name: /Catalog Synchronization Status/i })).toBeInTheDocument();
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
  }, 15000);

  it("renders About Page with concise unofficial disclaimers", async () => {
    render(await AboutPage());
    expect(screen.getByRole("heading", { name: /About SNHU Degree Map/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Important Disclaimer/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Related SNHU Tools/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "github.com/andrewtryder/snhu-tools" }),
    ).toHaveAttribute("href", "https://github.com/andrewtryder/snhu-tools");
    expect(screen.getByText(/This project is open source and the code may be found at/i)).toBeInTheDocument();
  }, 15000);
});
