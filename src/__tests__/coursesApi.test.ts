import { describe, expect, it } from "vitest";
import { GET as search } from "@/app/api/courses/search/route";
import { GET as trees } from "@/app/api/course-trees/[ids]/route";

describe("course APIs backed by static snapshots", () => {
  it("preserves search response contracts", async () => {
    expect((await search(new Request("https://local/api/courses/search?q=CS"))).status).toBe(200);
    expect(await (await search(new Request("https://local/api/courses/search?q=C"))).json()).toEqual([]);
  });
  it("preserves partial-tree response contracts", async () => {
    const batch = await trees(new Request("https://local/api/course-trees/PSY321,CS999"), { params: Promise.resolve({ ids: "PSY321,CS999" }) });
    expect(batch.status).toBe(200);
    expect(await batch.json()).toMatchObject({ trees: [{ course_id: "PSY321" }], errors: [{ id: "CS999" }] });
  });
});
