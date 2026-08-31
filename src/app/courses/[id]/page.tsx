import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import {
  getCourseById,
  getCourseTree,
  getDependentCourseIds,
  getDirectPrerequisiteIds,
} from "@/features/courses/lib/courses";
import { buildCourseSummary } from "@/features/courses/lib/courseSummary";
import { CoursePrerequisiteGraph } from "@/features/courses/components/CoursePrerequisiteGraph";
import {
  PrerequisiteTreeList,
  collectPrerequisiteIds,
} from "@/features/courses/components/PrerequisiteTreeList";
import { CourseSearchHeader } from "@/features/courses/components/CourseSearchHeader";
import { getSiteUrl } from "@/lib/siteUrl";

export const revalidate = false;

export async function generateStaticParams() {
  return [];
}

interface CoursePageProps {
  params: Promise<{ id: string }>;
}

function formatCredits(credits: string | number | null | undefined): string | null {
  if (credits == null || credits === "") {
    return null;
  }
  const n = typeof credits === "number" ? credits : Number(credits);
  if (!Number.isFinite(n) || n === 0) {
    return null;
  }
  const label = Number.isInteger(n) ? String(n) : String(n);
  return n === 1 ? "1 credit" : `${label} credits`;
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { id } = await params;
  const courseId = id.toUpperCase();
  const course = await getCourseById(courseId);

  if (!course) {
    return {
      title: "Course Not Found",
    };
  }

  const title = `${courseId} (${course.title}) Prerequisites`;
  const description = `View SNHU ${courseId} prerequisites and dependency relationships in a crawlable course planning page.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/courses/${courseId}`,
    },
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title: `${title} | SNHU Tools`,
      description,
      url: `/courses/${courseId}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | SNHU Tools`,
      description,
    },
  };
}

function buildCourseJsonLd(
  courseId: string,
  courseTitle: string,
  description: string | null,
  prerequisiteIds: string[],
  siteUrl: string,
) {
  const prereqSummary =
    prerequisiteIds.length > 0
      ? ` Prerequisites include ${prerequisiteIds.join(", ")}.`
      : " No listed prerequisites.";

  const courseSchema = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: courseTitle,
    courseCode: courseId,
    description:
      (description ??
        `Unofficial SNHU course prerequisite information for ${courseId}.`) +
      prereqSummary +
      " This unofficial site is for informational purposes only; confirm requirements with your SNHU advisor.",
    provider: {
      "@type": "CollegeOrUniversity",
      name: "Southern New Hampshire University",
    },
    url: `${siteUrl}/courses/${courseId}`,
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Courses",
        item: `${siteUrl}/courses`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: courseId,
        item: `${siteUrl}/courses/${courseId}`,
      },
    ],
  };

  return [courseSchema, breadcrumbSchema];
}

export default async function CourseDetailPage({ params }: CoursePageProps) {
  const { id } = await params;
  const courseId = id.toUpperCase();

  const [course, tree, directPrereqs, dependents] = await Promise.all([
    getCourseById(courseId),
    getCourseTree(courseId),
    getDirectPrerequisiteIds(courseId),
    getDependentCourseIds(courseId),
  ]);

  if (!course || !tree) {
    notFound();
  }

  const allPrereqIds = collectPrerequisiteIds(tree);
  const siteUrl = getSiteUrl();
  const jsonLd = buildCourseJsonLd(
    courseId,
    course.title,
    course.description,
    directPrereqs,
    siteUrl,
  );

  const summaryText = buildCourseSummary({
    courseId,
    directPrerequisiteCount: directPrereqs.length,
    totalPrerequisiteCount: allPrereqIds.length,
    dependentCount: dependents.length,
  });

  const academicLevel = course.academic_level?.trim() || null;
  const creditsLabel = formatCredits(course.credits);
  const description = course.description?.trim() || null;
  const metaParts = [academicLevel, creditsLabel].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <AppHeader currentPage="courses" />

      <main
        id="main-content"
        className="flex-1 mx-auto max-w-(--spacing-container-max) px-4 py-8 md:px-8 md:py-12 w-full"
      >
        {jsonLd.map((schema, index) => (
          <script
            key={index}
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(schema),
            }}
          />
        ))}

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-surface-variant/70 pb-6">
          <nav aria-label="Breadcrumbs" className="text-xs text-on-surface-variant flex items-center gap-1.5">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <span aria-hidden="true" className="text-outline">/</span>
            <Link href="/courses" className="hover:text-primary transition-colors">Courses</Link>
            <span aria-hidden="true" className="text-outline">/</span>
            <span className="font-semibold text-on-surface">{courseId}</span>
          </nav>
          <CourseSearchHeader initialQuery={courseId} />
        </div>

        <article aria-labelledby="course-heading">
          <header className="mb-10">
            <div className="inline-block rounded-md bg-surface-container-high px-2.5 py-1 text-xs font-bold text-primary mb-2">
              {courseId}
            </div>
            <h1
              id="course-heading"
              className="font-heading text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl"
            >
              {course.title}
            </h1>
            <p className="mt-3 text-sm font-medium text-on-surface-variant flex items-center flex-wrap gap-2">
              <Link
                href="/courses"
                className="text-primary hover:underline transition-colors font-semibold"
              >
                Course Directory
              </Link>
              <span aria-hidden="true" className="text-outline">·</span>
              <span>{summaryText}</span>
            </p>
            {metaParts.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-on-surface-variant">
                {metaParts.join(" · ")}
              </p>
            )}
            {description && (
              <p className="mt-4 text-sm leading-relaxed text-on-surface-variant max-w-3xl">
                {description}
              </p>
            )}
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
            <section aria-labelledby="prereq-list-heading" className="lg:col-span-1">
              <h2
                id="prereq-list-heading"
                className="mb-3 font-heading text-lg font-bold text-on-surface"
              >
                Prerequisite Tree
              </h2>
              <div className="rounded-xl border border-surface-variant bg-surface-container-low p-5 shadow-2xs">
                <PrerequisiteTreeList tree={tree} />
              </div>
            </section>

            <section aria-labelledby="graph-heading" className="lg:col-span-2">
              <h2
                id="graph-heading"
                className="mb-3 font-heading text-lg font-bold text-on-surface"
              >
                Interactive Prerequisite Graph
              </h2>
              <CoursePrerequisiteGraph
                trees={[tree]}
                graphKey={courseId}
                ariaLabel={`Interactive prerequisite graph for ${courseId}`}
                className="h-[24rem]"
              />
            </section>
          </div>

          {dependents.length > 0 && (
            <section aria-labelledby="dependents-heading" className="mb-12 border-t border-surface-variant/70 pt-8">
              <h2
                id="dependents-heading"
                className="mb-4 font-heading text-lg font-bold text-on-surface"
              >
                This Course Is Also a Prerequisite For
              </h2>
              <ul className="flex flex-wrap gap-2 list-none p-0">
                {dependents.map((dependentId) => (
                  <li key={dependentId}>
                    <Link
                      href={`/courses/${dependentId}`}
                      className="inline-flex items-center rounded-lg border border-surface-variant/60 bg-surface-container-lowest px-3 py-1.5 text-xs font-bold text-primary transition-all hover:border-primary hover:bg-surface-container hover:shadow-2xs"
                    >
                      {dependentId}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Important disclaimer" className="border-t border-surface-variant/70 pt-8">
            <div className="flex gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-low p-5 shadow-2xs">
              <Info
                className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div className="space-y-1.5 text-xs leading-relaxed text-on-surface-variant">
                <p className="font-bold text-on-surface text-sm">
                  Unofficial — For Informational Purposes Only
                </p>
                <p>
                  This site is unofficial and is intended for informational purposes only. Course requirements, transfer evaluations, catalog rules, and program requirements can change. Always confirm your academic plan with your SNHU advisor for official guidance.
                </p>
              </div>
            </div>
          </section>
        </article>
      </main>

      <AppFooter />
    </div>
  );
}
