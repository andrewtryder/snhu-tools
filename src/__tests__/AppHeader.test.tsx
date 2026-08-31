import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AppHeader } from "@/components/AppHeader";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => "/",
}));

describe("AppHeader Component", () => {
  it("renders text-only brand title with SNHU Tools identity", () => {
    render(<AppHeader />);
    const homeLink = screen.getByRole("link", { name: /SNHU Tools home/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveTextContent("SNHU");
    expect(homeLink).toHaveTextContent("Tools");
  });

  it("renders all four primary navigation links", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "Programs" })).toHaveAttribute("href", "/programs");
    expect(screen.getByRole("link", { name: "Courses" })).toHaveAttribute("href", "/courses");
    expect(screen.getByRole("link", { name: "Transfers" })).toHaveAttribute("href", "/transfers");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
  });

  it("indicates the active navigation section", () => {
    const { rerender } = render(<AppHeader currentPage="programs" />);
    expect(screen.getByRole("link", { name: "Programs" })).toHaveAttribute("aria-current", "page");

    rerender(<AppHeader currentPage="courses" />);
    expect(screen.getByRole("link", { name: "Courses" })).toHaveAttribute("aria-current", "page");

    rerender(<AppHeader currentPage="transfers" />);
    expect(screen.getByRole("link", { name: "Transfers" })).toHaveAttribute("aria-current", "page");

    rerender(<AppHeader currentPage="about" />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
  });

  it("renders global search input field", () => {
    render(<AppHeader />);
    const searchInput = screen.getByRole("searchbox", {
      name: /Search degree programs and requirements/i,
    });
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveAttribute(
      "placeholder",
      "Search programs, requirements, or courses (e.g. Computer Science)..."
    );
  });

  it("renders Browse Programs button and opens modal dialog", () => {
    render(<AppHeader />);
    const browseButton = screen.getByRole("button", { name: /Browse Programs/i });
    expect(browseButton).toBeInTheDocument();

    fireEvent.click(browseButton);

    const dialogTitle = screen.getByRole("heading", { name: /Browse SNHU Degree Programs/i });
    expect(dialogTitle).toBeInTheDocument();
  });
});
