import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import TransfersPage, { metadata } from "@/app/transfers/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/transfers",
}));

describe("Temporary Transfers Landing Page", () => {
  it("has noindex, nofollow metadata to prevent premature search indexing", () => {
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("renders integration notice and title", () => {
    render(<TransfersPage />);
    expect(
      screen.getByRole("heading", { name: /Transfer Equivalencies/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Under Integration")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Explore Degree Programs/i })
    ).toHaveAttribute("href", "/programs");
  });
});
