/**
 * Verifies that CourseExplorerClient initializes from the ?ids= URL search
 * parameter on mount (client-side) after the server-side searchParams
 * dependency was removed from /courses/page.tsx.
 *
 * This preserves the shared-link behavior: a URL like /courses?ids=CS330,CS350
 * must still auto-populate the search input and trigger the graph fetch, even
 * though the server no longer processes ?ids= directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import React from "react";

const mockUseSearchParams = vi.fn(() => new URLSearchParams());

// All vi.mock() calls must be at the top level — they are hoisted before any
// test code runs, regardless of where they appear in the file.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/courses",
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    ReactFlow: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="react-flow">{children}</div>
    ),
    Controls: () => <div data-testid="react-flow-controls" />,
    Background: () => <div data-testid="react-flow-background" />,
  };
});

describe("CourseExplorerClient URL initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it("renders the search input without crashing when no ?ids= param is present", async () => {
    const { CourseExplorerShell } = await import(
      "@/features/courses/components/CourseExplorerShell"
    );

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <React.Suspense fallback={null}>
          <CourseExplorerShell />
        </React.Suspense>,
      ));
    });

    // Should render a search input
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    // Input value should be empty when no ?ids= param
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("populates the search input with the ?ids= param value on mount", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("ids=CS330,CS350"));

    const { CourseExplorerShell } = await import(
      "@/features/courses/components/CourseExplorerShell"
    );

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <React.Suspense fallback={null}>
          <CourseExplorerShell />
        </React.Suspense>,
      ));
    });

    await waitFor(() => {
      const input = container.querySelector("input") as HTMLInputElement;
      // The input should have been populated with the URL ids param
      expect(input.value).toBe("CS330,CS350");
    }, { timeout: 3000 });
  });
});
