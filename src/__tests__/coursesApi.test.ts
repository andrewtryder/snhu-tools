import { describe, expect, it } from "vitest";
import { GET as courses } from "@/app/api/courses/route";
import { GET as course } from "@/app/api/course/[id]/route";
import { GET as search } from "@/app/api/courses/search/route";
import { GET as tree } from "@/app/api/course-tree/[id]/route";
import { GET as trees } from "@/app/api/course-trees/[ids]/route";

describe("course APIs backed by static snapshots", () => {
  it("preserves validation and cache headers", async () => {
    expect((await courses(new Request("https://local/api/courses"))).status).toBe(400);
    const response = await courses(new Request("https://local/api/courses?ids=CS210,IT140"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=86400, stale-while-revalidate=86400");
    expect(await response.json()).toEqual([{ catalog_course_id: "CS210" }, { catalog_course_id: "IT140" }]);
    expect((await courses(new Request("https://local/api/courses?ids=CS999"))).status).toBe(404);
  });
  it("preserves course and search response contracts", async () => {
    const response = await course(new Request("https://local/api/course/CS210"), { params: Promise.resolve({ id: "cs210" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).catalog_course_id).toBe("CS210");
    expect((await search(new Request("https://local/api/courses/search?q=CS"))).status).toBe(200);
    expect(await (await search(new Request("https://local/api/courses/search?q=C"))).json()).toEqual([]);
  });
  it("preserves tree and partial-tree response contracts", async () => {
    const response = await tree(new Request("https://local/api/course-tree/PSY321"), { params: Promise.resolve({ id: "psy321" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).course_id).toBe("PSY321");
    const batch = await trees(new Request("https://local/api/course-trees/PSY321,CS999"), { params: Promise.resolve({ ids: "PSY321,CS999" }) });
    expect(batch.status).toBe(200);
    expect(await batch.json()).toMatchObject({ trees: [{ course_id: "PSY321" }], errors: [{ id: "CS999" }] });
  });
});
