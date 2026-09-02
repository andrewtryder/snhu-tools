import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SearchPage, { generateMetadata } from "@/app/search/page";
import * as globalSearchModule from "@/lib/search/globalSearch";

vi.mock("@/lib/search/globalSearch", () => ({
  searchAll: vi.fn(),
}));

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

vi.mock("@/components/AppFooter", () => ({
  AppFooter: () => <footer data-testid="app-footer">AppFooter</footer>,
}));

describe("SearchPage component and metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports metadata with robots index: false and follow: true", async () => {
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ q: "CS210" }),
    });

    expect(meta.title).toBe('Search: "CS210" | SNHU Tools');
    expect(meta.robots).toEqual({
      index: false,
      follow: true,
    });
  });

  it("renders short query prompt when query is less than 2 characters", async () => {
    const ui = await SearchPage({
      searchParams: Promise.resolve({ q: "c" }),
    });
    render(ui);

    expect(screen.getByText(/Enter at least 2 characters to search SNHU Tools/i)).toBeInTheDocument();
    expect(globalSearchModule.searchAll).not.toHaveBeenCalled();
  });

  it("renders grouped results for Programs, Courses, and Transfers", async () => {
    vi.mocked(globalSearchModule.searchAll).mockResolvedValueOnce({
      query: "cs210",
      results: {
        programs: [
          {
            type: "program",
            id: "computer-science-bs",
            title: "Computer Science (BS)",
            subtitle: "BS",
            href: "/programs/computer-science-bs",
          },
        ],
        courses: [
          {
            type: "course",
            id: "CS210",
            title: "CS210",
            subtitle: "Programming Languages",
            href: "/courses/CS210",
          },
        ],
        transfers: [
          {
            type: "transfer",
            id: "CS210",
            title: "CS210",
            subtitle: "2 transfer options",
            href: "/transfers/courses/cs210",
            optionCount: 2,
          },
        ],
      },
      counts: {
        programs: 1,
        courses: 1,
        transfers: 1,
        total: 3,
      },
    });

    const ui = await SearchPage({
      searchParams: Promise.resolve({ q: "cs210" }),
    });
    render(ui);

    expect(screen.getByRole("heading", { name: /Search Results for "cs210"/i })).toBeInTheDocument();

    // Section headings
    expect(screen.getByRole("heading", { name: "Degree Programs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Courses" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Transfer Options" })).toBeInTheDocument();

    // Result items
    expect(screen.getByRole("heading", { name: "Computer Science (BS)" })).toBeInTheDocument();
    expect(screen.getByText("Programming Languages")).toBeInTheDocument();
    expect(screen.getByText("2 transfer options")).toBeInTheDocument();

    // Links
    const programLink = screen.getByRole("link", { name: /Computer Science \(BS\)/i });
    expect(programLink).toHaveAttribute("href", "/programs/computer-science-bs");

    const courseLink = screen.getByRole("link", { name: /Programming Languages/i });
    expect(courseLink).toHaveAttribute("href", "/courses/CS210");

    const transferLink = screen.getByRole("link", { name: /2 transfer options/i });
    expect(transferLink).toHaveAttribute("href", "/transfers/courses/cs210");
  });

  it("renders clear no-results message when all groups are empty", async () => {
    vi.mocked(globalSearchModule.searchAll).mockResolvedValueOnce({
      query: "xyznonexistent",
      results: {
        programs: [],
        courses: [],
        transfers: [],
      },
      counts: {
        programs: 0,
        courses: 0,
        transfers: 0,
        total: 0,
      },
    });

    const ui = await SearchPage({
      searchParams: Promise.resolve({ q: "xyznonexistent" }),
    });
    render(ui);

    expect(screen.getByText(/No matching results found for/i)).toBeInTheDocument();
  });

  it("renders notice when one or more domains are unavailable", async () => {
    vi.mocked(globalSearchModule.searchAll).mockResolvedValueOnce({
      query: "cs210",
      results: {
        programs: [],
        courses: [
          {
            type: "course",
            id: "CS210",
            title: "CS210",
            subtitle: "Programming Languages",
            href: "/courses/CS210",
          },
        ],
        transfers: [],
      },
      counts: {
        programs: 0,
        courses: 1,
        transfers: 0,
        total: 1,
      },
      unavailable: ["transfers"],
    });

    const ui = await SearchPage({
      searchParams: Promise.resolve({ q: "cs210" }),
    });
    render(ui);

    expect(screen.getByText(/Some search results are temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText("Programming Languages")).toBeInTheDocument();
  });
});
