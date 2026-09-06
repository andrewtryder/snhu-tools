import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { CourseExplorerShell } from "@/features/courses/components/CourseExplorerShell";
import { getAllCourseSummaries, type CourseSummary } from "@/features/courses/lib/courses";
import { getSiteUrl } from "@/lib/siteUrl";

import { serializeJsonLd } from "@/lib/safeJsonLd";

// Indefinite Full Route Cache — invalidated on demand by POST /api/revalidate?scope=courses.
// Removing the searchParams prop was the prerequisite: accessing searchParams in a Server
// Component is a dynamic API that opts the entire route out of static rendering.
export const revalidate = false;

const title = "SNHU Courses & Prerequisite Explorer";
const description =
  "Explore SNHU course prerequisite graphs, visualize degree dependencies, and browse the full course catalog directory.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/courses",
  },
  openGraph: {
    title: `${title} | SNHU Tools`,
    description,
    url: "/courses",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} | SNHU Tools`,
    description,
  },
};

/** Subject prefix from a normalized course ID (e.g. IT-140 → IT). */
function subjectPrefix(courseId: string): string {
  const upper = courseId.toUpperCase();
  const beforeHyphen = upper.split("-")[0] ?? upper;
  const letters = beforeHyphen.match(/^[A-Z]+/)?.[0];
  return letters && letters.length > 0 ? letters : "Other";
}

function parseCourseIdParts(courseId: string): { prefix: string; number: number; rest: string } {
  const upper = courseId.toUpperCase();
  const match = upper.match(/^([A-Z]+)-?(\d+)?(.*)$/);
  if (!match) {
    return { prefix: upper, number: Number.POSITIVE_INFINITY, rest: "" };
  }
  return {
    prefix: match[1],
    number: match[2] ? Number(match[2]) : Number.POSITIVE_INFINITY,
    rest: match[3] ?? "",
  };
}

function compareCourseIdsNatural(a: string, b: string): number {
  const pa = parseCourseIdParts(a);
  const pb = parseCourseIdParts(b);
  if (pa.prefix !== pb.prefix) {
    return pa.prefix.localeCompare(pb.prefix);
  }
  if (pa.number !== pb.number) {
    return pa.number - pb.number;
  }
  if (pa.rest !== pb.rest) {
    return pa.rest.localeCompare(pb.rest);
  }
  return a.localeCompare(b);
}

interface CourseGroup {
  subject: string;
  courses: CourseSummary[];
}

function groupCoursesBySubject(summaries: CourseSummary[]): CourseGroup[] {
  const groups = new Map<string, CourseSummary[]>();

  for (const summary of summaries) {
    const subject = subjectPrefix(summary.catalog_course_id);
    const list = groups.get(subject);
    if (list) {
      list.push(summary);
    } else {
      groups.set(subject, [summary]);
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, courses]) => ({
      subject,
      courses: [...courses].sort((x, y) =>
        compareCourseIdsNatural(x.catalog_course_id, y.catalog_course_id),
      ),
    }));
}

export default async function CoursesPage() {
  const summaries = await getAllCourseSummaries();
  const groups = groupCoursesBySubject(summaries);
  const siteUrl = getSiteUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: `${siteUrl}/courses`,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/courses?ids={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <AppHeader currentPage="courses" />

      <main id="main-content" className="flex-1 mx-auto max-w-(--spacing-container-max) px-4 py-8 md:px-8 md:py-12 w-full">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />

        <header className="mb-10 text-center max-w-2xl mx-auto">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
            SNHU Courses &amp; Prerequisites
          </h1>
          <p className="mt-3 text-base leading-relaxed text-on-surface-variant">
            Explore interactive prerequisite trees for individual courses or multiple subjects, and browse the full SNHU course catalog directory.
          </p>
        </header>

        <section aria-labelledby="explorer-heading" className="mb-16">
          <h2 id="explorer-heading" className="sr-only">
            Interactive Prerequisite Explorer
          </h2>
          {/*
            CourseExplorerShell wraps CourseExplorerClient (which calls useSearchParams)
            in a Suspense boundary. This is required by Next.js when useSearchParams is
            used in a client child of a statically rendered server page.
            The client component reads ?ids= from the URL on mount, preserving
            the shared-link and browser-history behavior without a server searchParams
            dependency.
          */}
          <CourseExplorerShell />
        </section>

        <section aria-labelledby="directory-heading" className="border-t border-surface-variant/70 pt-12">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="directory-heading"
                className="font-heading text-2xl font-bold tracking-tight text-on-surface"
              >
                Course Catalog Directory
              </h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Browse available courses by subject prefix to view complete prerequisite trees and details.
              </p>
            </div>
            {summaries.length > 0 && (
              <p className="text-xs font-semibold text-on-surface-variant">
                {summaries.length} total courses across {groups.length} subjects
              </p>
            )}
          </div>

          {groups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-8 text-center">
              <p className="text-sm text-on-surface-variant">
                Course listings are temporarily unavailable. Please try again later.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map(({ subject, courses }) => (
                <section
                  key={subject}
                  aria-labelledby={`subject-${subject}`}
                  className="rounded-xl border border-surface-variant/80 bg-surface-container-low p-5 shadow-2xs"
                >
                  <h3
                    id={`subject-${subject}`}
                    className="mb-4 font-heading text-lg font-bold text-on-surface flex items-center gap-2"
                  >
                    <span>{subject}</span>
                    <span className="text-xs font-normal text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                      {courses.length} {courses.length === 1 ? "course" : "courses"}
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {courses.map((course) => (
                      <Link
                        key={course.catalog_course_id}
                        href={`/courses/${course.catalog_course_id}`}
                        prefetch={false}
                        className="rounded-md border border-surface-variant/40 bg-surface-container-lowest p-2.5 text-xs font-medium text-primary transition-all hover:border-primary/50 hover:bg-surface-container-high hover:shadow-2xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span className="font-bold text-primary">{course.catalog_course_id}</span>
                        {course.title && (
                          <span className="block truncate text-on-surface-variant mt-0.5 font-normal">
                            {course.title}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
