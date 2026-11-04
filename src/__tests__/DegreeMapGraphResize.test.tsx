import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DegreeMapGraph } from "@/components/graph/DegreeMapGraph";
import { fixturePrograms } from "@/data/fixturePrograms";

describe("degree map resize", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defers and coalesces resize work, cancelling it when fullscreen changes", () => {
    const observers: { callback: ResizeObserverCallback; targets: Element[]; disconnect: ReturnType<typeof vi.fn> }[] = [];
    class TestResizeObserver {
      targets: Element[] = [];
      disconnect = vi.fn();
      constructor(public callback: ResizeObserverCallback) { observers.push(this); }
      observe = (target: Element) => { this.targets.push(target); };
      unobserve = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const request = vi.spyOn(window, "requestAnimationFrame");
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const program = fixturePrograms.find((p) => p.slug === "computer-science-bs")!;
    const { unmount } = render(<DegreeMapGraph nodesData={program.nodes} edgesData={program.edges} programTitle={program.title} />);
    const region = screen.getByRole("region", { name: /interactive prerequisite graph/i });
    const observer = observers.find((item) => item.targets.includes(region))!;
    expect(observer).toBeDefined();
    const notify = (width: number) => observer.callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    act(() => { notify(800); notify(900); });
    expect(cancel).toHaveBeenCalled();
    const pending = request.mock.results.at(-1)?.value;
    fireEvent.click(screen.getByTitle("Full Screen Mode"));
    expect(observer.disconnect).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(pending);
    unmount();
    request.mockRestore();
    cancel.mockRestore();
  });
});
