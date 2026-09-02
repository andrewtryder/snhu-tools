import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GlobalSearch } from "@/components/GlobalSearch";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

const mockSearchData = {
  query: "cs210",
  results: {
    programs: [
      {
        type: "program" as const,
        id: "computer-science-bs",
        title: "Computer Science (BS)",
        subtitle: "BS",
        href: "/programs/computer-science-bs",
      },
    ],
    courses: [
      {
        type: "course" as const,
        id: "CS210",
        title: "CS210",
        subtitle: "Programming Languages",
        href: "/courses/CS210",
      },
    ],
    transfers: [
      {
        type: "transfer" as const,
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
};

describe("GlobalSearch Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("fail")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Server error" }),
        };
      }
      return {
        ok: true,
        json: async () => mockSearchData,
      };
    });
  });

  it("renders with proper combobox and accessibility attributes", () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("combobox", {
      name: /Search SNHU programs, courses, and transfer options/i,
    });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute(
      "placeholder",
      "Search programs, courses, or transfer options..."
    );
  });

  it("fetches suggestions and renders grouped results upon typing at least 2 characters", async () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cs210" } });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    expect(screen.getByText("Degree Programs")).toBeInTheDocument();
    expect(screen.getByText("Computer Science (BS)")).toBeInTheDocument();

    expect(screen.getByText("Courses")).toBeInTheDocument();
    expect(screen.getByText("Programming Languages")).toBeInTheDocument();

    expect(screen.getByText("Transfer Options")).toBeInTheDocument();
    expect(screen.getByText("2 transfer options")).toBeInTheDocument();

    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("navigates with ArrowDown and ArrowUp and selects option with Enter", async () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cs210" } });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    const options = screen.getAllByRole("option");
    expect(options.length).toBe(3);

    // ArrowDown to first option (Program)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);

    // ArrowDown to second option (Course)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    // Enter to select Course
    fireEvent.keyDown(input, { key: "Enter" });
    expect(pushMock).toHaveBeenCalledWith("/courses/CS210");
  });

  it("submits to /search?q=... when Enter is pressed without highlighted suggestion", async () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "accounting" } });
    fireEvent.submit(input.closest("form")!);

    expect(pushMock).toHaveBeenCalledWith("/search?q=accounting");
    expect(pushMock).not.toHaveBeenCalledWith(expect.stringContaining("/programs"));
  });

  it("navigates directly to canonical href when option is clicked", async () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cs210" } });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    const transferOption = screen.getAllByRole("option")[2];
    fireEvent.mouseDown(transferOption);

    expect(pushMock).toHaveBeenCalledWith("/transfers/courses/cs210");
  });

  it("closes suggestions dropdown when Escape is pressed", async () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cs210" } });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("shows graceful unavailable message when autocomplete fetch fails", async () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "fail_query" } });

    await waitFor(() => {
      expect(screen.getByText("Search suggestions unavailable")).toBeInTheDocument();
    });

    // Enter still navigates to /search
    fireEvent.submit(input.closest("form")!);
    expect(pushMock).toHaveBeenCalledWith("/search?q=fail_query");
  });
});
