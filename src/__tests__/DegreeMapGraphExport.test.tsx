import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DegreeMapGraph } from "@/components/graph/DegreeMapGraph";
import { fixturePrograms } from "@/data/fixturePrograms";

type ToPng = (
  element: HTMLElement,
  options?: { filter?: (node: HTMLElement) => boolean },
) => Promise<string>;

const toPngMock = vi.fn<ToPng>(async () => "data:image/png;base64,TESTPNG");

vi.mock("html-to-image", () => ({
  toPng: (...args: Parameters<ToPng>) => toPngMock(...args),
}));

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    getNodesBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    getViewportForBounds: () => ({ x: 0, y: 0, zoom: 1 }),
  };
});

describe("DegreeMapGraph image export", () => {
  const csProgram = fixturePrograms.find((p) => p.slug === "computer-science-bs")!;

  beforeEach(() => {
    toPngMock.mockClear();
    toPngMock.mockResolvedValue("data:image/png;base64,TESTPNG");
  });

  it("opens a PNG preview modal when Print is clicked", async () => {
    const { container } = render(
      <DegreeMapGraph
        nodesData={csProgram.nodes}
        edgesData={csProgram.edges}
        programTitle={csProgram.title}
        catalogYear={csProgram.catalogYear}
      />,
    );

    const region = container.querySelector('[aria-label*="Interactive prerequisite graph"]');
    expect(region).toBeTruthy();
    const viewport = document.createElement("div");
    viewport.className = "react-flow__viewport";
    region!.appendChild(viewport);

    expect(screen.queryByPlaceholderText(/Search map/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Preview and print degree map image/i));

    await waitFor(() => {
      expect(toPngMock).toHaveBeenCalled();
    }, { timeout: 5000 });

    expect(await screen.findByAltText(/Degree map preview for Computer Science/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download PNG/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print Image/i })).toBeInTheDocument();

    const filterArg = toPngMock.mock.calls[0]?.[1];
    expect(filterArg?.filter).toBeTypeOf("function");
    const controls = document.createElement("div");
    controls.className = "react-flow__controls";
    expect(filterArg!.filter!(controls)).toBe(false);
  }, 15000);

  it("recovers when image generation fails", async () => {
    toPngMock.mockRejectedValueOnce(new Error("canvas failed"));
    const { container } = render(
      <DegreeMapGraph
        nodesData={csProgram.nodes}
        edgesData={csProgram.edges}
        programTitle={csProgram.title}
        catalogYear={csProgram.catalogYear}
      />,
    );

    const region = container.querySelector('[aria-label*="Interactive prerequisite graph"]');
    const viewport = document.createElement("div");
    viewport.className = "react-flow__viewport";
    region!.appendChild(viewport);

    fireEvent.click(screen.getByLabelText(/Preview and print degree map image/i));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Unable to render the degree map image/i);
    expect(screen.getByLabelText(/Preview and print degree map image/i)).not.toBeDisabled();
  }, 15000);
});
