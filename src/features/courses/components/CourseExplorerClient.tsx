"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GitBranch } from "lucide-react";
import { layoutCourseGraph, type CourseTree } from "../lib/courseGraphLayout";
import { coursePath, parseCourseIdList } from "../lib/courseIds";
import { CourseSearchInput } from "./CourseSearchInput";

const CONTROL_LABELS: Record<string, string> = {
  "react-flow__controls-zoomin": "Zoom in",
  "react-flow__controls-zoomout": "Zoom out",
  "react-flow__controls-fitview": "Fit view",
  "react-flow__controls-interactive": "Toggle interactivity",
};

function labelGraphControls(container: HTMLElement | null) {
  if (!container) return;

  const controls = container.querySelector(".react-flow__controls");
  if (!controls) return;

  controls.setAttribute("role", "toolbar");
  controls.setAttribute("aria-label", "Graph view controls");

  for (const button of controls.querySelectorAll("button")) {
    for (const className of button.classList) {
      const label = CONTROL_LABELS[className];
      if (label) {
        button.setAttribute("aria-label", label);
        break;
      }
    }
  }
}

function courseTreesPath(courseIds: string[]): string {
  return `/api/course-trees/${courseIds.map(encodeURIComponent).join(",")}`;
}

interface CourseExplorerClientProps {
  initialIds?: string;
  initialTrees?: CourseTree[];
  initialError?: string;
}

export function CourseExplorerClient({
  initialIds,
  initialTrees,
  initialError,
}: CourseExplorerClientProps) {
  const router = useRouter();
  const [courseQuery, setCourseQuery] = useState(initialIds ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const initialGraph = initialTrees ? layoutCourseGraph(initialTrees) : null;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialGraph?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialGraph?.edges ?? []);
  const [hasSearched, setHasSearched] = useState(Boolean(initialTrees) || Boolean(initialError));
  const [lastSearchedIds, setLastSearchedIds] = useState(
    initialTrees ? (initialIds ?? "") : "",
  );
  const graphSectionRef = useRef<HTMLElement>(null);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const generateGraph = useCallback(
    (dataArray: CourseTree[]) => {
      const { nodes: layoutedNodes, edges: layoutedEdges } = layoutCourseGraph(dataArray);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    },
    [setNodes, setEdges],
  );

  const handleSearch = useCallback(
    async (rawCourseIds: string[]) => {
      const parsed = parseCourseIdList(rawCourseIds.join(","));
      if (parsed.errors.length > 0) {
        setError(parsed.errors.map((e) => e.message).join(" "));
        setHasSearched(true);
        setNodes([]);
        setEdges([]);
        return;
      }

      const courseIds = parsed.ids;

      if (courseIds.length === 1) {
        router.push(coursePath(courseIds[0]));
        return;
      }

      setIsLoading(true);
      setError(null);
      setHasSearched(true);

      try {
        const response = await fetch(courseTreesPath(courseIds));
        const data = await response.json().catch(() => null);

        const trees: CourseTree[] = Array.isArray(data?.trees) ? data.trees : [];
        const treeErrors: { id: string; code: string; message: string }[] = Array.isArray(
          data?.errors,
        )
          ? data.errors
          : [];

        if (!response.ok) {
          const unknownIds = treeErrors
            .filter((e) => e.code === "not_found")
            .map((e) => e.id);

          if (unknownIds.length > 0) {
            throw new Error(
              `Unknown course${unknownIds.length > 1 ? "s" : ""}: ${unknownIds.join(", ")}`,
            );
          }

          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Course validation is temporarily unavailable. Please try again later.",
          );
        }

        if (trees.length === 0) {
          const unknownIds = treeErrors.filter((e) => e.code === "not_found").map((e) => e.id);
          throw new Error(
            unknownIds.length > 0
              ? `Unknown course${unknownIds.length > 1 ? "s" : ""}: ${unknownIds.join(", ")}`
              : typeof data?.error === "string"
                ? data.error
                : "Failed to fetch course data",
          );
        }

        setLastSearchedIds(courseIds.join(","));
        generateGraph(trees);

        if (typeof window !== "undefined") {
          const params = new URLSearchParams();
          params.set("ids", courseIds.join(","));
          window.history.replaceState(null, "", `/courses?${params.toString()}`);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
        setNodes([]);
        setEdges([]);
      } finally {
        setIsLoading(false);
      }
    },
    [generateGraph, router, setNodes, setEdges],
  );

  const showEmptyState = !hasSearched && nodes.length === 0 && !error;
  const showGraph = hasSearched && !error && nodes.length > 0;

  const statusMessage = isLoading
    ? "Loading course prerequisite graph…"
    : showGraph
      ? `Course prerequisite graph ready for ${lastSearchedIds.replace(/,/g, ", ")}`
      : "";

  useEffect(() => {
    if (!showGraph) return;

    const frame = requestAnimationFrame(() => {
      labelGraphControls(graphSectionRef.current);
    });

    return () => cancelAnimationFrame(frame);
  }, [showGraph, lastSearchedIds]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center gap-3">
        <CourseSearchInput
          value={courseQuery}
          onChange={setCourseQuery}
          onSubmit={handleSearch}
          isLoading={isLoading}
          variant="inline"
        />
        <p className="text-xs text-on-surface-variant">
          Enter a single course (e.g. <span className="font-semibold text-on-surface">CS499</span>) or multiple comma-separated courses (e.g. <span className="font-semibold text-on-surface">CS330, CS350, MAT243</span>).
        </p>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </p>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-error/30 bg-error-container/20 p-4 text-center text-sm font-medium text-error"
        >
          {error}
        </div>
      )}

      {showEmptyState && (
        <div
          role="region"
          aria-label="Course prerequisite visualizer placeholder"
          className="flex min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-8 text-center"
        >
          <GitBranch className="h-10 w-10 text-outline" aria-hidden="true" />
          <h2 className="mt-3 font-[family-name:var(--font-headline)] text-lg font-semibold text-on-surface">
            Prerequisite Graph Explorer
          </h2>
          <p className="mt-1 max-w-md text-sm text-on-surface-variant">
            Search for a course ID above to view its prerequisite tree, or enter multiple courses to see how their requirement trees interconnect.
          </p>
        </div>
      )}

      {showGraph && (
        <section
          ref={graphSectionRef}
          role="region"
          aria-label={`Interactive prerequisite graph for ${lastSearchedIds.replace(/,/g, ", ")}`}
          className="relative h-[32rem] overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-xs"
        >
          <ReactFlow
            key={lastSearchedIds}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodesDraggable={false}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            attributionPosition="bottom-right"
            className="bg-surface-container-lowest"
          >
            <Background color="#e4e2e1" gap={16} />
            <Controls className="!border-surface-variant !bg-surface-container-lowest !shadow-xs" />
          </ReactFlow>
        </section>
      )}
    </div>
  );
}
