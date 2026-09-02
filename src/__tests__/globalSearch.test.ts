import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchAll } from "@/lib/search/globalSearch";
import * as serverData from "@/lib/serverData";
import * as courseSearch from "@/features/courses/lib/searchCourses";
import * as transferSearch from "@/features/transfers/lib/searchTransferCourses";

vi.mock("@/lib/serverData", () => ({
  searchPrograms: vi.fn(),
}));

vi.mock("@/features/courses/lib/searchCourses", () => ({
  searchCourses: vi.fn(),
}));

vi.mock("@/features/transfers/lib/searchTransferCourses", () => ({
  searchTransferCourses: vi.fn(),
}));

describe("globalSearch - searchAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty response for query under 2 characters", async () => {
    const res = await searchAll("a");
    expect(res.query).toBe("a");
    expect(res.counts.total).toBe(0);
    expect(res.results.programs).toEqual([]);
    expect(res.results.courses).toEqual([]);
    expect(res.results.transfers).toEqual([]);
    expect(serverData.searchPrograms).not.toHaveBeenCalled();
  });

  it("aggregates and groups results from all three domains with canonical hrefs", async () => {
    vi.mocked(serverData.searchPrograms).mockResolvedValueOnce([
      {
        slug: "accounting-bs",
        title: "Accounting (BS)",
        credential: "BS",
        degreeLevel: "Undergraduate",
      },
    ] as unknown as Awaited<ReturnType<typeof serverData.searchPrograms>>);

    vi.mocked(courseSearch.searchCourses).mockResolvedValueOnce([
      {
        catalog_course_id: "ACC201",
        title: "Financial Accounting",
      },
    ]);

    vi.mocked(transferSearch.searchTransferCourses).mockResolvedValueOnce([
      {
        courseNumber: "ACC201",
        optionCount: 13,
      },
    ]);

    const res = await searchAll("acc");

    expect(res.query).toBe("acc");
    expect(res.counts.programs).toBe(1);
    expect(res.counts.courses).toBe(1);
    expect(res.counts.transfers).toBe(1);
    expect(res.counts.total).toBe(3);

    expect(res.results.programs[0]).toEqual({
      type: "program",
      id: "accounting-bs",
      title: "Accounting (BS)",
      subtitle: "BS",
      href: "/programs/accounting-bs",
    });

    expect(res.results.courses[0]).toEqual({
      type: "course",
      id: "ACC201",
      title: "ACC201",
      subtitle: "Financial Accounting",
      href: "/courses/ACC201",
    });

    expect(res.results.transfers[0]).toEqual({
      type: "transfer",
      id: "ACC201",
      title: "ACC201",
      subtitle: "13 transfer options",
      href: "/transfers/courses/acc201",
      optionCount: 13,
    });

    expect(res.unavailable).toBeUndefined();
  });

  it("isolates domain failures and returns partial results with unavailable list", async () => {
    vi.mocked(serverData.searchPrograms).mockResolvedValueOnce([
      {
        slug: "computer-science-bs",
        title: "Computer Science (BS)",
        credential: "BS",
        degreeLevel: "Undergraduate",
      },
    ] as unknown as Awaited<ReturnType<typeof serverData.searchPrograms>>);

    vi.mocked(courseSearch.searchCourses).mockResolvedValueOnce([
      {
        catalog_course_id: "CS210",
        title: "Programming Languages",
      },
    ]);

    // Transfers fails with database error
    vi.mocked(transferSearch.searchTransferCourses).mockRejectedValueOnce(
      new Error("Transfers database connection timeout")
    );

    const res = await searchAll("cs");

    expect(res.counts.programs).toBe(1);
    expect(res.counts.courses).toBe(1);
    expect(res.counts.transfers).toBe(0);
    expect(res.counts.total).toBe(2);
    expect(res.unavailable).toEqual(["transfers"]);
    expect(res.results.programs[0].id).toBe("computer-science-bs");
    expect(res.results.courses[0].id).toBe("CS210");
  });

  it("respects limit option across queries", async () => {
    vi.mocked(serverData.searchPrograms).mockResolvedValueOnce([]);
    vi.mocked(courseSearch.searchCourses).mockResolvedValueOnce([]);
    vi.mocked(transferSearch.searchTransferCourses).mockResolvedValueOnce([]);

    await searchAll("test", { limit: 8 });

    expect(serverData.searchPrograms).toHaveBeenCalledWith("test", { limit: 8 });
    expect(courseSearch.searchCourses).toHaveBeenCalledWith("test", { limit: 8 });
    expect(transferSearch.searchTransferCourses).toHaveBeenCalledWith("test", { limit: 8 });
  });
});
