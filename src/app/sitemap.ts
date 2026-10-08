import { MetadataRoute } from "next";
import { getCatalogLastUpdated, getSitemapPrograms } from "@/lib/serverData";
import { PROGRAM_LEVEL_PATHS } from "@/lib/programLevelCategories";
import { getSiteUrl } from "@/lib/siteUrl";
import { getSitemapCatalogData } from "@/features/courses/lib/courses";
import { getTransferSitemapData } from "@/features/transfers/lib/seoQueries";
import { slugify, transferCoursePath } from "@/features/transfers/lib/slug";
import { getStaticSnapshotManifest } from "@/lib/staticSnapshots";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const catalogUpdated = await getCatalogLastUpdated().catch(() => null);
  const staticLastModified = catalogUpdated ?? undefined;

  const categoryRoutes: MetadataRoute.Sitemap = PROGRAM_LEVEL_PATHS.map((entry) => ({
    url: `${baseUrl}/programs/${entry.path}`,
    lastModified: staticLastModified,
    changeFrequency: "weekly" as const,
    priority: 0.85,
  }));

  const staticHubRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/programs`,
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...categoryRoutes,
    {
      url: `${baseUrl}/courses`,
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/transfers`,
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/transfers/browse`,
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/transfers/courses`,
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/transfers/subjects`,
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/transfers/organizations`,
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/transfers/levels`,
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: staticLastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const routesByUrl = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const route of staticHubRoutes) {
    routesByUrl.set(route.url, route);
  }

  const expected = getStaticSnapshotManifest().domains;
  const dynamicCounts = { programs: 0, courses: 0, transfers: 0 };
  const errors: Error[] = [];

  // 1. Dynamic Program Routes (isolated)
  try {
    const programs = await getSitemapPrograms();
    for (const program of programs) {
      const lastModified = program.updatedAt ?? catalogUpdated ?? undefined;
      const detailUrl = `${baseUrl}/programs/${program.slug}`;
      const reqsUrl = `${baseUrl}/programs/${program.slug}/requirements`;
      routesByUrl.set(detailUrl, {
        url: detailUrl,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.8,
      });
      routesByUrl.set(reqsUrl, {
        url: reqsUrl,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.75,
      });
      dynamicCounts.programs += 2;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    errors.push(err);
    console.error("Failed to load program routes for sitemap:", err.message);
  }

  // 2. Dynamic Course Routes (isolated)
  try {
    const { courseIds, catalogLastModified } = await getSitemapCatalogData();
    const courseModified = catalogLastModified ?? catalogUpdated ?? undefined;
    for (const courseId of courseIds) {
      if (!courseId) continue;
      const url = `${baseUrl}/courses/${courseId}`;
      routesByUrl.set(url, {
        url,
        lastModified: courseModified,
        changeFrequency: "weekly",
        priority: 0.75,
      });
      dynamicCounts.courses += 1;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    errors.push(err);
    console.error("Failed to load course routes for sitemap:", err.message);
  }

  // 3. Dynamic Transfer Routes (isolated)
  try {
    const { courseNumbers, subjects, organizations, levels, lastModified } = await getTransferSitemapData();
    const transferModified = lastModified ?? undefined;

    for (const courseNumber of courseNumbers) {
      if (!courseNumber) continue;
      const path = transferCoursePath(courseNumber);
      const url = `${baseUrl}${path}`;
      routesByUrl.set(url, {
        url,
        lastModified: transferModified,
        changeFrequency: "weekly",
        priority: 0.75,
      });
      dynamicCounts.transfers += 1;
    }

    for (const subject of subjects) {
      if (!subject) continue;
      const slug = slugify(subject);
      if (!slug) continue;
      const url = `${baseUrl}/transfers/subjects/${slug}`;
      routesByUrl.set(url, {
        url,
        lastModified: transferModified,
        changeFrequency: "weekly",
        priority: 0.7,
      });
      dynamicCounts.transfers += 1;
    }

    for (const organization of organizations) {
      if (!organization) continue;
      const slug = slugify(organization);
      if (!slug) continue;
      const url = `${baseUrl}/transfers/organizations/${slug}`;
      routesByUrl.set(url, {
        url,
        lastModified: transferModified,
        changeFrequency: "weekly",
        priority: 0.7,
      });
      dynamicCounts.transfers += 1;
    }

    for (const level of levels) {
      if (!level) continue;
      const slug = slugify(level);
      if (!slug) continue;
      const url = `${baseUrl}/transfers/levels/${slug}`;
      routesByUrl.set(url, {
        url,
        lastModified: transferModified,
        changeFrequency: "weekly",
        priority: 0.7,
      });
      dynamicCounts.transfers += 1;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    errors.push(err);
    console.error("Failed to load transfer routes for sitemap:", err.message);
  }

  // A required dataset may never disappear from a sitemap, regardless of DB credentials.
  // Snapshot validation establishes expected non-empty domains before route generation.
  if (errors.length > 0 || dynamicCounts.programs === 0 || dynamicCounts.courses === 0 || dynamicCounts.transfers === 0 || !expected.programs.required || !expected.courses.required || !expected.transfers.required) {
    throw new Error(
      `Failed to load complete dynamic sitemap routes; aborting to preserve previous sitemap cache. (${errors.map((e) => e.message).join("; ")})`,
    );
  }

  return Array.from(routesByUrl.values());
}
