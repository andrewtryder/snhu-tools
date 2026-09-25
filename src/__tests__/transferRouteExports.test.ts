/**
 * Verifies that all four transfer dynamic detail pages export the correct ISR
 * constants — matching the /courses/[id] and /programs/[slug] patterns.
 *
 * These tests guard against accidental regression where a contributor removes
 * the ISR exports and the routes silently fall back to fully-dynamic rendering,
 * undoing the Vercel Fast Origin Transfer reduction.
 */
import { describe, it, expect } from "vitest";

describe("Transfer detail page ISR exports", () => {
  it("subjects/[subject] exports dynamicParams=true, revalidate=false, and an empty generateStaticParams", async () => {
    const mod = await import("@/app/transfers/subjects/[subject]/page");
    expect(mod.dynamicParams).toBe(true);
    expect(mod.revalidate).toBe(false);
    expect(typeof mod.generateStaticParams).toBe("function");
    expect(await mod.generateStaticParams()).toEqual([]);
  }, 15000);

  it("organizations/[organization] exports dynamicParams=true, revalidate=false, and an empty generateStaticParams", async () => {
    const mod = await import("@/app/transfers/organizations/[organization]/page");
    expect(mod.dynamicParams).toBe(true);
    expect(mod.revalidate).toBe(false);
    expect(typeof mod.generateStaticParams).toBe("function");
    expect(await mod.generateStaticParams()).toEqual([]);
  });

  it("levels/[level] exports dynamicParams=true, revalidate=false, and an empty generateStaticParams", async () => {
    const mod = await import("@/app/transfers/levels/[level]/page");
    expect(mod.dynamicParams).toBe(true);
    expect(mod.revalidate).toBe(false);
    expect(typeof mod.generateStaticParams).toBe("function");
    expect(await mod.generateStaticParams()).toEqual([]);
  });

  it("courses/[courseNumber] exports dynamicParams=true, revalidate=false, and an empty generateStaticParams", async () => {
    const mod = await import("@/app/transfers/courses/[courseNumber]/page");
    expect(mod.dynamicParams).toBe(true);
    expect(mod.revalidate).toBe(false);
    expect(typeof mod.generateStaticParams).toBe("function");
    expect(await mod.generateStaticParams()).toEqual([]);
  });

  it("transfer index pages export revalidate=false (event-driven ISR)", async () => {
    const { revalidate: transfersRevalidate } = await import("@/app/transfers/page");
    const { revalidate: subjectsRevalidate } = await import("@/app/transfers/subjects/page");
    const { revalidate: orgsRevalidate } = await import("@/app/transfers/organizations/page");
    const { revalidate: levelsRevalidate } = await import("@/app/transfers/levels/page");
    const { revalidate: coursesRevalidate } = await import("@/app/transfers/courses/page");

    expect(transfersRevalidate).toBe(false);
    expect(subjectsRevalidate).toBe(false);
    expect(orgsRevalidate).toBe(false);
    expect(levelsRevalidate).toBe(false);
    expect(coursesRevalidate).toBe(false);
  });

  it("/courses page exports revalidate=false (on-demand ISR) and has no searchParams dependency", async () => {
    const mod = await import("@/app/courses/page");
    expect(mod.revalidate).toBe(false);
    // The default export must accept zero arguments — no searchParams prop
    const fn = mod.default as (...args: unknown[]) => unknown;
    expect(fn.length).toBe(0);
  });
});
