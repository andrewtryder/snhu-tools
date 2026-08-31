import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CourseExplorerClient } from "@/features/courses/components/CourseExplorerClient";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="react-flow">{children}</div>,
    Controls: () => <div data-testid="react-flow-controls" />,
    Background: () => <div data-testid="react-flow-background" />,
  };
});

describe("CourseExplorerClient component", () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    replaceStateSpy = vi.spyOn(window.history, "replaceState");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("navigates to /courses/[id] when a single course is searched", () => {
    render(<CourseExplorerClient />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "CS330" } });

    const searchBtn = screen.getByRole("button", { name: "Search courses" });
    fireEvent.click(searchBtn);

    expect(pushMock).toHaveBeenCalledWith("/courses/CS330");
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it("fetches course trees and updates URL without router navigation on multi-course search", async () => {
    const mockTrees = [
      { course_id: "CS330", name: "Comp Graphics" },
      { course_id: "CS350", name: "Emerging Systems" },
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ trees: mockTrees, errors: [] }),
    } as Response);

    render(<CourseExplorerClient />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "CS330, CS350" } });

    const searchBtn = screen.getByRole("button", { name: "Search courses" });
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/course-trees/CS330,CS350");
    });

    await waitFor(() => {
      expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    });

    // Validates URL synchronization with replaceState without router.push
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/courses?ids=CS330%2CCS350");
  });

  it("displays error alert and does not update URL on failed multi-course response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        trees: [],
        errors: [{ id: "CS999", code: "not_found", message: "Course not found: CS999" }],
      }),
    } as Response);

    render(<CourseExplorerClient />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "CS330, CS999" } });

    const searchBtn = screen.getByRole("button", { name: "Search courses" });
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Unknown course: CS999");
    });

    expect(screen.queryByTestId("react-flow")).not.toBeInTheDocument();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });
});
