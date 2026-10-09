import { describe, expect, it } from "vitest";
import { getStaticSnapshotManifest } from "@/lib/staticSnapshots";
import { getCourseDetailPageData } from "@/features/courses/lib/courses";
import { getPrograms } from "@/lib/serverData";
import { getTransferSitemapData } from "@/features/transfers/lib/seoQueries";

describe("deployment-bundled static snapshots", () => {
  it("validates every required domain and serves catalog routes without POSTGRES_URL", async () => {
    const manifest = getStaticSnapshotManifest();
    expect(typeof manifest.fixture).toBe("boolean");
    expect(Object.values(manifest.domains).every((entry) => entry.required)).toBe(true);
    expect((await getCourseDetailPageData("PSY321")).course?.catalog_course_id).toBe("PSY321");
    expect((await getPrograms()).length).toBeGreaterThan(0);
    expect((await getTransferSitemapData()).courseNumbers).toContain("PSY321");
  });
});
