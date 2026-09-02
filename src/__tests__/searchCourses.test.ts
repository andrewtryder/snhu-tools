import { describe, it, expect, vi } from "vitest";
import { searchCourses } from "@/features/courses/lib/searchCourses";
import { coursePath } from "@/features/courses/lib/courseIds";

vi.mock("@/features/courses/db/pool", () => {
  const mockRows = [
    { catalog_course_id: "CS210", title: "Programming Languages" },
    { catalog_course_id: "CS250", title: "Software Development Lifecycle" },
    { catalog_course_id: "IT140", title: "Introduction to Python Programming" },
    { catalog_course_id: "CS499", title: "Computer Science Capstone" },
  ];

  return {
    withPoolClient: vi.fn(async (fn) => {
      const mockClient = {
        sql: vi.fn((strings, ...values) => {
          // values: containsPattern, normalizedContainsPattern, containsPattern, normalizedQuery, prefixPattern, normalizedPrefixPattern, limit
          const contains = String(values[0] || "").replace(/%/g, "").toUpperCase();
          const normalizedContains = String(values[1] || "").replace(/%/g, "").toUpperCase();
          const normalizedQuery = String(values[3] || "").toUpperCase();
          const prefix = String(values[4] || "").replace(/%/g, "").toUpperCase();
          const normalizedPrefix = String(values[5] || "").replace(/%/g, "").toUpperCase();
          const titlePrefix = String(values[8] || "").replace(/%/g, "").toUpperCase();

          const filtered = mockRows.filter(
            (r) =>
              (contains && r.catalog_course_id.toUpperCase().includes(contains)) ||
              (normalizedContains && r.catalog_course_id.toUpperCase().includes(normalizedContains)) ||
              (contains && r.title.toUpperCase().includes(contains))
          );

          // Sort mimicking SQL ranking:
          // 1: exact normalized code
          // 2: code prefix (trimmed or normalized)
          // 3: code contains (trimmed or normalized)
          // 4: title prefix
          // 5: title contains
          // 6: else
          filtered.sort((a, b) => {
            const score = (r: typeof a) => {
              const code = r.catalog_course_id.toUpperCase();
              const title = r.title.toUpperCase();
              if (code === normalizedQuery) return 1;
              if (code.startsWith(prefix) || code.startsWith(normalizedPrefix)) return 2;
              if (code.includes(contains) || code.includes(normalizedContains)) return 3;
              if (title.startsWith(titlePrefix)) return 4;
              if (title.includes(contains)) return 5;
              return 6;
            };
            return score(a) - score(b);
          });

          const limit = Number(values[values.length - 1]) || 10;
          return { rows: filtered.slice(0, limit) };
        }),
      };
      return fn(mockClient);
    }),
  };
});

describe("searchCourses", () => {
  it("returns empty array for empty or whitespace query", async () => {
    const results = await searchCourses("   ");
    expect(results).toEqual([]);
  });

  it("finds course by exact or normalized course code (CS210, cs210, CS 210, CS-210) resolving to canonical href", async () => {
    for (const query of ["CS210", "cs210", "CS 210", "CS-210"]) {
      const results = await searchCourses(query);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].catalog_course_id).toBe("CS210");
      expect(results[0].title).toBe("Programming Languages");
      expect(coursePath(results[0].catalog_course_id)).toBe("/courses/CS210");
    }
  });

  it("finds course by title match when query does not match course code, preserving nonmatching fixtures", async () => {
    const query = "python";
    const results = await searchCourses(query);

    // Explicitly prove:
    // 1. Result is returned
    expect(results.length).toBe(1);
    const it140 = results[0];
    expect(it140.catalog_course_id).toBe("IT140");
    expect(it140.title).toBe("Introduction to Python Programming");

    // 2. Query does NOT match course code
    expect(it140.catalog_course_id.toLowerCase()).not.toContain(query.toLowerCase());

    // 3. Query DOES match title
    expect(it140.title.toLowerCase()).toContain(query.toLowerCase());

    // 4. Non-matching fixtures (CS210, CS250, CS499) are excluded
    const otherIds = results.map((r) => r.catalog_course_id);
    expect(otherIds).not.toContain("CS210");
    expect(otherIds).not.toContain("CS250");
    expect(otherIds).not.toContain("CS499");
  });

  it("prioritizes exact course code over title-only match", async () => {
    const results = await searchCourses("CS210");
    expect(results[0].catalog_course_id).toBe("CS210");
  });

  it("respects limit parameter", async () => {
    const results = await searchCourses("CS", { limit: 1 });
    expect(results.length).toBe(1);
  });
});
