import { render, screen, fireEvent, within } from "@testing-library/react";
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

  it("renders all four primary navigation links in desktop and mobile navigation regions", () => {
    render(<AppHeader />);
    const desktopNav = screen.getByRole("navigation", { name: "Main navigation" });
    const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });

    for (const nav of [desktopNav, mobileNav]) {
      const links = within(nav);
      expect(links.getByRole("link", { name: "Programs" })).toHaveAttribute("href", "/programs");
      expect(links.getByRole("link", { name: "Courses" })).toHaveAttribute("href", "/courses");
      expect(links.getByRole("link", { name: "Transfers" })).toHaveAttribute("href", "/transfers");
      expect(links.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    }
  });

  it("indicates the active navigation section across both desktop and mobile navigation", () => {
    const { rerender } = render(<AppHeader currentPage="programs" />);
    const desktopNav = screen.getByRole("navigation", { name: "Main navigation" });
    const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });

    expect(within(desktopNav).getByRole("link", { name: "Programs" })).toHaveAttribute("aria-current", "page");
    expect(within(mobileNav).getByRole("link", { name: "Programs" })).toHaveAttribute("aria-current", "page");

    rerender(<AppHeader currentPage="courses" />);
    expect(within(desktopNav).getByRole("link", { name: "Courses" })).toHaveAttribute("aria-current", "page");
    expect(within(mobileNav).getByRole("link", { name: "Courses" })).toHaveAttribute("aria-current", "page");

    rerender(<AppHeader currentPage="transfers" />);
    expect(within(desktopNav).getByRole("link", { name: "Transfers" })).toHaveAttribute("aria-current", "page");
    expect(within(mobileNav).getByRole("link", { name: "Transfers" })).toHaveAttribute("aria-current", "page");

    rerender(<AppHeader currentPage="about" />);
    expect(within(desktopNav).getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
    expect(within(mobileNav).getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
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
