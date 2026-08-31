import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProgramBrowserDialog } from "@/components/ProgramBrowserDialog";
import { fixturePrograms } from "@/data/fixturePrograms";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => "/programs",
}));

describe("ProgramBrowserDialog Component", () => {
  it("renders when open and displays program fixtures", () => {
    render(<ProgramBrowserDialog isOpen={true} onClose={vi.fn()} initialPrograms={fixturePrograms} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
    expect(screen.getByText("Cybersecurity")).toBeInTheDocument();
    expect(screen.getByText("Nursing (RN to BSN)")).toBeInTheDocument();
  });

  it("filters programs by search term", () => {
    render(<ProgramBrowserDialog isOpen={true} onClose={vi.fn()} initialPrograms={fixturePrograms} />);

    const searchInput = screen.getByRole("searchbox", { name: /Search programs in modal/i });
    fireEvent.change(searchInput, { target: { value: "Cyber" } });

    expect(screen.getByText("Cybersecurity")).toBeInTheDocument();
    expect(screen.queryByText("Computer Science")).not.toBeInTheDocument();
  });

  it("filters programs by degree level filter pill", () => {
    render(<ProgramBrowserDialog isOpen={true} onClose={vi.fn()} initialPrograms={fixturePrograms} />);

    const rnBtn = screen.getByRole("button", { name: /^RN to BSN$/i });
    fireEvent.click(rnBtn);

    expect(screen.getByText("Nursing (RN to BSN)")).toBeInTheDocument();
    expect(screen.queryByText("Computer Science")).not.toBeInTheDocument();
  });

  it("closes dialog on Escape key press", () => {
    const handleClose = vi.fn();
    render(<ProgramBrowserDialog isOpen={true} onClose={handleClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleClose).toHaveBeenCalled();
  });
});
