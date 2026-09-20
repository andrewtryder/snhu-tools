import "server-only";

import { getSitemapPrograms } from "@/lib/serverData";
import { PROGRAM_LEVEL_PATHS } from "@/lib/programLevelCategories";
import { getSitemapCatalogData } from "@/features/courses/lib/courses";
import { getTransferSitemapData } from "@/features/transfers/lib/seoQueries";
import { slugify, transferCoursePath } from "@/features/transfers/lib/slug";
import { isIndexableDeployment } from "@/lib/deploymentEnv";
import { getSiteUrl } from "@/lib/siteUrl";

export const INDEXNOW_KEY = "7d4543f657b1ccc9b149991d961be00c";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_MAX_URLS = 10_000;

export type IndexNowScope = "programs" | "courses" | "transfers" | "all";

export type IndexNowSubmissionResult = {
  submitted: boolean;
  scope: IndexNowScope;
  urlCount: number;
  status?: number;
  reason?: "non-production";
};

function addUrl(urls: Set<string>, baseUrl: string, path: string) {
  urls.add(path === "/" ? baseUrl : `${baseUrl}${path}`);
}

async function addProgramUrls(urls: Set<string>, baseUrl: string) {
  addUrl(urls, baseUrl, "/");
  addUrl(urls, baseUrl, "/programs");
  for (const entry of PROGRAM_LEVEL_PATHS) {
    addUrl(urls, baseUrl, `/programs/${entry.path}`);
  }

  const programs = await getSitemapPrograms();
  for (const program of programs) {
    if (!program.slug) continue;
    addUrl(urls, baseUrl, `/programs/${program.slug}`);
    addUrl(urls, baseUrl, `/programs/${program.slug}/requirements`);
  }
}

async function addCourseUrls(urls: Set<string>, baseUrl: string) {
  addUrl(urls, baseUrl, "/courses");

  const { courseIds } = await getSitemapCatalogData();
  for (const courseId of courseIds) {
    if (!courseId) continue;
    addUrl(urls, baseUrl, `/courses/${courseId}`);
  }
}

async function addTransferUrls(urls: Set<string>, baseUrl: string) {
  const staticPaths = [
    "/transfers",
    "/transfers/browse",
    "/transfers/courses",
    "/transfers/subjects",
    "/transfers/organizations",
    "/transfers/levels",
  ];

  for (const path of staticPaths) {
    addUrl(urls, baseUrl, path);
  }

  const { courseNumbers, subjects, organizations, levels } = await getTransferSitemapData();

  for (const courseNumber of courseNumbers) {
    if (!courseNumber) continue;
    addUrl(urls, baseUrl, transferCoursePath(courseNumber));
  }

  for (const subject of subjects) {
    const slug = slugify(subject);
    if (slug) addUrl(urls, baseUrl, `/transfers/subjects/${slug}`);
  }

  for (const organization of organizations) {
    const slug = slugify(organization);
    if (slug) addUrl(urls, baseUrl, `/transfers/organizations/${slug}`);
  }

  for (const level of levels) {
    const slug = slugify(level);
    if (slug) addUrl(urls, baseUrl, `/transfers/levels/${slug}`);
  }
}

export async function getIndexNowUrls(scope: IndexNowScope): Promise<string[]> {
  const baseUrl = getSiteUrl();
  const urls = new Set<string>();

  if (scope === "programs" || scope === "all") {
    await addProgramUrls(urls, baseUrl);
  }
  if (scope === "courses" || scope === "all") {
    await addCourseUrls(urls, baseUrl);
  }
  if (scope === "transfers" || scope === "all") {
    await addTransferUrls(urls, baseUrl);
  }
  if (scope === "all") {
    addUrl(urls, baseUrl, "/about");
  }

  return Array.from(urls);
}

export async function submitIndexNow(scope: IndexNowScope): Promise<IndexNowSubmissionResult> {
  if (!isIndexableDeployment()) {
    return { submitted: false, scope, urlCount: 0, reason: "non-production" };
  }

  const baseUrl = getSiteUrl();
  const urlList = await getIndexNowUrls(scope);

  if (urlList.length > INDEXNOW_MAX_URLS) {
    throw new Error(`IndexNow URL batch exceeds ${INDEXNOW_MAX_URLS} URLs`);
  }

  if (urlList.length === 0) {
    return { submitted: false, scope, urlCount: 0 };
  }

  const keyLocation = `${baseUrl}/${INDEXNOW_KEY}.txt`;
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      host: new URL(baseUrl).host,
      key: INDEXNOW_KEY,
      keyLocation,
      urlList,
    }),
  });

  if (!response.ok) {
    throw new Error(`IndexNow submission failed with HTTP ${response.status}`);
  }

  return {
    submitted: true,
    scope,
    urlCount: urlList.length,
    status: response.status,
  };
}
