import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CoursesPage, { metadata } from "@/app/courses/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/courses",
}));

describe("Temporary Courses Landing Page", () => {
  it("has noindex, nofollow metadata to prevent premature search indexing", () => {
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("renders integration notice and title", () => {
    render(<CoursesPage />);
    expect(
      screen.getByRole("heading", { name: /Course Catalog & Prerequisites/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Under Integration")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Explore Degree Programs/i })
    ).toHaveAttribute("href", "/programs");
  });
});
