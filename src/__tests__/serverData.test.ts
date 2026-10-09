import { describe, it, expect } from "vitest";
import {
  getPrograms,
  getProgramBySlug,
  searchPrograms,
  getCatalogYears,
} from "@/lib/serverData";

describe("serverData Access Layer", () => {
  it("retrieves list of all programs with optional filtering", async () => {
    const programs = await getPrograms();
    expect(programs.length).toBeGreaterThan(0);
    expect(programs[0]).toHaveProperty("slug");

    const bsOnly = await getPrograms({ level: "BS" });
    expect(bsOnly.every((p) => p.degreeLevel === "BS")).toBe(true);
  });

  it("retrieves program details by canonical slug", async () => {
    const csProgram = await getProgramBySlug("computer-science-bs");
    expect(csProgram).toBeDefined();
    expect(csProgram?.title).toContain("Computer Science");
    expect(csProgram?.degreeLevel).toBe("BS");

    const nonExistent = await getProgramBySlug("non-existent-slug");
    expect(nonExistent).toBeNull();
  });

  it("searches programs by query string", async () => {
    const results = await searchPrograms("Cyber");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toMatch(/Cyber\s*security/i);
  });

  it("returns available catalog years", async () => {
    const years = await getCatalogYears();
    expect(years).toContain("2025-2026");
  });
});
