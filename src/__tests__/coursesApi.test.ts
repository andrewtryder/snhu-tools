import { beforeEach, describe, expect, it, vi } from "vitest";

const { withPoolClientMock, getCourseTreeMock, getCourseTreesMock } = vi.hoisted(() => ({
  withPoolClientMock: vi.fn(),
  getCourseTreeMock: vi.fn(),
  getCourseTreesMock: vi.fn(),
}));

vi.mock("@/features/courses/db/pool", () => ({
  withPoolClient: withPoolClientMock,
}));

vi.mock("@/features/courses/lib/courses", () => ({
  getCourseTree: getCourseTreeMock,
  getCourseTrees: getCourseTreesMock,
}));

import { GET as getCourses } from "@/app/api/courses/route";
import { GET as searchCourses } from "@/app/api/courses/search/route";
import { GET as getCourse } from "@/app/api/course/[id]/route";
import { GET as getCourseTreeRoute } from "@/app/api/course-tree/[id]/route";
import { GET as getCourseTreesRoute } from "@/app/api/course-trees/[ids]/route";

describe("Courses API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/courses", () => {
    it("returns 400 when ids param is missing", async () => {
      const request = new Request("https://localhost/api/courses");
      const response = await getCourses(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("No ids provided");
    });

    it("returns 400 when ids param contains invalid course IDs", async () => {
      const request = new Request("https://localhost/api/courses?ids=invalid_id");
      const response = await getCourses(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Invalid course ID");
    });

    it("returns course rows for valid IDs", async () => {
      const client = {
        query: vi.fn().mockResolvedValueOnce({
          rows: [{ catalog_course_id: "CS110" }, { catalog_course_id: "IT140" }],
        }),
      };
      withPoolClientMock.mockImplementationOnce((fn: (c: unknown) => unknown) => fn(client));

      const request = new Request("https://localhost/api/courses?ids=CS110,IT140");
      const response = await getCourses(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveLength(2);
      expect(data[0].catalog_course_id).toBe("CS110");
    });

    it("returns 404 when no courses match", async () => {
      const client = {
        query: vi.fn().mockResolvedValueOnce({ rows: [] }),
      };
      withPoolClientMock.mockImplementationOnce((fn: (c: unknown) => unknown) => fn(client));

      const request = new Request("https://localhost/api/courses?ids=CS999");
      const response = await getCourses(request);
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("Classes not found.");
    });
  });

  describe("GET /api/courses/search", () => {
    it("returns empty array for empty query", async () => {
      const request = new Request("https://localhost/api/courses/search?q=");
      const response = await searchCourses(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual([]);
    });

    it("returns matching suggestions with query limit", async () => {
      const client = {
        sql: vi.fn().mockResolvedValueOnce({
          rows: [
            { catalog_course_id: "CS110", title: "Introduction to Computer Science" },
            { catalog_course_id: "CS210", title: "Intro to Software Development" },
          ],
        }),
      };
      withPoolClientMock.mockImplementationOnce((fn: (c: unknown) => unknown) => fn(client));

      const request = new Request("https://localhost/api/courses/search?q=CS&limit=5");
      const response = await searchCourses(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveLength(2);
    });
  });

  describe("GET /api/course/[id]", () => {
    it("returns course row for valid ID", async () => {
      const client = {
        sql: vi.fn().mockResolvedValueOnce({
          rows: [
            {
              title: "Intro to Software Development",
              catalog_course_id: "CS210",
              credits: "3",
            },
          ],
        }),
      };
      withPoolClientMock.mockImplementationOnce((fn: (c: unknown) => unknown) => fn(client));

      const request = new Request("https://localhost/api/course/CS210");
      const response = await getCourse(request, { params: Promise.resolve({ id: "cs210" }) });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.catalog_course_id).toBe("CS210");
    });

    it("returns 404 when course is not found", async () => {
      const client = {
        sql: vi.fn().mockResolvedValueOnce({ rows: [] }),
      };
      withPoolClientMock.mockImplementationOnce((fn: (c: unknown) => unknown) => fn(client));

      const request = new Request("https://localhost/api/course/CS999");
      const response = await getCourse(request, { params: Promise.resolve({ id: "cs999" }) });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Class ID 'CS999' not found." });
    });
  });

  describe("GET /api/course-tree/[id]", () => {
    it("returns tree for valid course", async () => {
      getCourseTreeMock.mockResolvedValueOnce({
        course_id: "CS210",
        name: "Intro to Software Development",
      });

      const request = new Request("https://localhost/api/course-tree/CS210");
      const response = await getCourseTreeRoute(request, { params: Promise.resolve({ id: "cs210" }) });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.course_id).toBe("CS210");
    });

    it("returns 404 when tree is not found", async () => {
      getCourseTreeMock.mockResolvedValueOnce(null);

      const request = new Request("https://localhost/api/course-tree/CS999");
      const response = await getCourseTreeRoute(request, { params: Promise.resolve({ id: "cs999" }) });
      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/course-trees/[ids]", () => {
    it("returns trees and partial errors when multiple IDs requested", async () => {
      getCourseTreesMock.mockResolvedValueOnce([
        {
          id: "CS210",
          tree: { course_id: "CS210", name: "Intro to Software Development" },
        },
        {
          id: "CS999",
          tree: null,
        },
      ]);

      const request = new Request("https://localhost/api/course-trees/CS210,CS999");
      const response = await getCourseTreesRoute(request, {
        params: Promise.resolve({ ids: "CS210,CS999" }),
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.trees).toHaveLength(1);
      expect(data.errors).toHaveLength(1);
      expect(data.errors[0].id).toBe("CS999");
    });

    it("returns 404 when all requested trees are missing", async () => {
      getCourseTreesMock.mockResolvedValueOnce([
        { id: "CS999", tree: null },
      ]);

      const request = new Request("https://localhost/api/course-trees/CS999");
      const response = await getCourseTreesRoute(request, {
        params: Promise.resolve({ ids: "CS999" }),
      });
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("No course trees found.");
    });
  });
});
