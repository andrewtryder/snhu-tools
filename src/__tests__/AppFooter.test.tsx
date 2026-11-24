import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AppFooter, formatCatalogLastUpdated } from "@/components/AppFooter";

describe("AppFooter Component", () => {
  it("renders compact footer with last updated, disclaimer, and local links", () => {
    render(<AppFooter lastUpdated={new Date("2026-07-31T12:00:00Z")} snapshotVerifiedAt="2026-08-03T12:00:00Z" />);

    expect(screen.getByText(/Program data last synced:/)).toBeInTheDocument();
    expect(screen.getByText("July 31, 2026")).toBeInTheDocument();
    expect(screen.getByText(/Published snapshot verified:/)).toBeInTheDocument();
    expect(screen.getByText("August 3, 2026")).toBeInTheDocument();
    expect(screen.getByText(/Unofficial SNHU site/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Programs" })).toHaveAttribute("href", "/programs");
    expect(screen.getByRole("link", { name: "Courses" })).toHaveAttribute("href", "/courses");
    expect(screen.getByRole("link", { name: "Transfers" })).toHaveAttribute("href", "/transfers");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: /Source Code/i })).toHaveAttribute(
      "href",
      "https://github.com/andrewtryder/snhu-tools"
    );
  });

  it("shows an honest fallback when synchronization data is unavailable", () => {
    render(<AppFooter lastUpdated={null} />);
    expect(screen.getByText(/Program data last synced:/)).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });

  it("does not invent a verification date when provenance is unavailable", () => {
    render(<AppFooter lastUpdated="2026-07-31" snapshotVerifiedAt={null} />);
    expect(screen.getByText(/Published snapshot verified:/)).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });

  it("formats cached timestamp strings and safely rejects invalid values", () => {
    expect(formatCatalogLastUpdated("2026-07-31T22:52:52.021Z")).toBe("July 31, 2026");
    expect(formatCatalogLastUpdated("not-a-date")).toBe("Not available");
  });
});
