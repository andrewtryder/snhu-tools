import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CoursesPage, { metadata as coursesMetadata } from "@/app/courses/page";
import CourseDetailPage, { generateMetadata as generateCourseMetadata } from "@/app/courses/[id]/page";
import nextConfig from "../../next.config.js";

const {
  getAllCourseSummariesMock,
  getCourseByIdMock,
  getCourseTreeMock,
  getDirectPrerequisiteIdsMock,
  getDependentCourseIdsMock,
  getCourseTreesMock,
  notFoundMock,
} = vi.hoisted(() => ({
  getAllCourseSummariesMock: vi.fn(),
  getCourseByIdMock: vi.fn(),
  getCourseTreeMock: vi.fn(),
  getDirectPrerequisiteIdsMock: vi.fn(),
  getDependentCourseIdsMock: vi.fn(),
  getCourseTreesMock: vi.fn(),
  notFoundMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/courses",
  notFound: notFoundMock,
}));

vi.mock("@/features/courses/lib/courses", () => ({
  getAllCourseSummaries: getAllCourseSummariesMock,
  getCourseById: getCourseByIdMock,
  getCourseTree: getCourseTreeMock,
  getDirectPrerequisiteIds: getDirectPrerequisiteIdsMock,
  getDependentCourseIds: getDependentCourseIdsMock,
  getCourseTrees: getCourseTreesMock,
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

describe("Courses Pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("/courses hub route", () => {
    it("has temporary noindex, nofollow metadata during integration", () => {
      expect(coursesMetadata.robots).toEqual({
        index: false,
        follow: false,
      });
      expect(coursesMetadata.alternates?.canonical).toBe("/courses");
    });

    it("renders heading, interactive explorer, and crawlable directory grouped by subject", async () => {
      getAllCourseSummariesMock.mockResolvedValueOnce([
        { catalog_course_id: "CS110", title: "Introduction to Computer Science" },
        { catalog_course_id: "CS210", title: "Intro to Software Development" },
        { catalog_course_id: "IT140", title: "Introduction to Scripting" },
      ]);

      const page = await CoursesPage({ searchParams: Promise.resolve({}) });
      render(page);

      expect(
        screen.getByRole("heading", { name: "SNHU Courses & Prerequisites", level: 1 }),
      ).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Course Catalog Directory", level: 2 })).toBeInTheDocument();

      expect(screen.getByRole("heading", { name: /CS/i, level: 3 })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /IT/i, level: 3 })).toBeInTheDocument();

      const cs110Link = screen.getByRole("link", { name: /CS110/i });
      expect(cs110Link).toHaveAttribute("href", "/courses/CS110");
      const it140Link = screen.getByRole("link", { name: /IT140/i });
      expect(it140Link).toHaveAttribute("href", "/courses/IT140");
    }, 15000);
  });

  describe("/courses/[id] detail route", () => {
    const sampleCourse = {
      title: "Data Structures and Algorithms",
      pid: "1001",
      catalog_course_id: "CS300",
      description: "Analysis and design of data structures.",
      academic_level: "Undergraduate",
      credits: "3",
      subject_code: "CS",
    };

    const sampleTree = {
      course_id: "CS300",
      name: "Data Structures and Algorithms",
      prerequisites: [
        {
          course_id: "CS260",
          name: "Data Structures",
        },
      ],
    };

    it("generates canonical metadata targeting /courses/[id]", async () => {
      getCourseByIdMock.mockResolvedValueOnce(sampleCourse);

      const metadata = await generateCourseMetadata({ params: Promise.resolve({ id: "cs300" }) });
      expect(metadata.title).toBe("CS300 (Data Structures and Algorithms) Prerequisites");
      expect(metadata.alternates?.canonical).toBe("/courses/CS300");
      expect(metadata.robots).toEqual({ index: false, follow: false });
    });

    it("renders course details, crawlable prerequisite tree, dependents, and graph", async () => {
      getCourseByIdMock.mockResolvedValueOnce(sampleCourse);
      getCourseTreeMock.mockResolvedValueOnce(sampleTree);
      getDirectPrerequisiteIdsMock.mockResolvedValueOnce(["CS260"]);
      getDependentCourseIdsMock.mockResolvedValueOnce(["CS330", "CS350"]);

      const page = await CourseDetailPage({ params: Promise.resolve({ id: "cs300" }) });
      render(page);

      expect(screen.getByRole("heading", { name: "Data Structures and Algorithms", level: 1 })).toBeInTheDocument();
      expect(screen.getAllByText("CS300").length).toBeGreaterThan(0);
      expect(screen.getByText(/Undergraduate/)).toBeInTheDocument();
      expect(screen.getByText(/3 credits/)).toBeInTheDocument();
      expect(screen.getByText("Analysis and design of data structures.")).toBeInTheDocument();

      // Prerequisite tree
      expect(screen.getByRole("heading", { name: "Prerequisite Tree", level: 2 })).toBeInTheDocument();
      const cs260Link = screen.getByRole("link", { name: "CS260" });
      expect(cs260Link).toHaveAttribute("href", "/courses/CS260");

      // Dependents
      expect(screen.getByRole("heading", { name: "This Course Is Also a Prerequisite For", level: 2 })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "CS330" })).toHaveAttribute("href", "/courses/CS330");
      expect(screen.getByRole("link", { name: "CS350" })).toHaveAttribute("href", "/courses/CS350");

      // Interactive graph
      expect(screen.getByRole("region", { name: "Interactive prerequisite graph for CS300" })).toBeInTheDocument();

      // Disclaimer
      expect(screen.getByText("Unofficial — For Informational Purposes Only")).toBeInTheDocument();
    }, 15000);

    it("safely serializes JSON-LD without literal script breakout tags", async () => {
      getCourseByIdMock.mockResolvedValueOnce({
        ...sampleCourse,
        description: "Course with </script><script>alert(1)</script> injection.",
      });
      getCourseTreeMock.mockResolvedValueOnce(sampleTree);
      getDirectPrerequisiteIdsMock.mockResolvedValueOnce([]);
      getDependentCourseIdsMock.mockResolvedValueOnce([]);

      const page = await CourseDetailPage({ params: Promise.resolve({ id: "cs300" }) });
      const { container } = render(page);

      const scripts = Array.from(container.querySelectorAll("script[type='application/ld+json']"));
      expect(scripts.length).toBeGreaterThan(0);
      for (const script of scripts) {
        expect(script.innerHTML).not.toContain("</script>");
        expect(script.innerHTML).not.toContain("<script>");
      }
      expect(scripts.some((s) => s.innerHTML.includes("\\u003c/script>"))).toBe(true);
    });

    it("calls notFound when course does not exist", async () => {
      getCourseByIdMock.mockResolvedValueOnce(null);
      getCourseTreeMock.mockResolvedValueOnce(null);
      getDirectPrerequisiteIdsMock.mockResolvedValueOnce([]);
      getDependentCourseIdsMock.mockResolvedValueOnce([]);
      notFoundMock.mockImplementationOnce(() => {
        throw new Error("NEXT_NOT_FOUND");
      });

      await expect(
        CourseDetailPage({ params: Promise.resolve({ id: "UNKNOWN999" }) }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFoundMock).toHaveBeenCalled();
    });
  });

  describe("Internal compatibility redirect", () => {
    it("configures permanent HTTP 308 redirect from /course/:id to /courses/:id", async () => {
      const redirects = await nextConfig.redirects();
      const courseRedirect = redirects.find(
        (r: { source: string; destination: string; permanent: boolean }) =>
          r.source === "/course/:id",
      );

      expect(courseRedirect).toBeDefined();
      expect(courseRedirect).toEqual({
        source: "/course/:id",
        destination: "/courses/:id",
        permanent: true,
      });
    });
  });
});
