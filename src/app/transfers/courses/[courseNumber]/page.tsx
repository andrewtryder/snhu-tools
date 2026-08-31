import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { EquivalencyTable } from "@/features/transfers/components/EquivalencyTable";
import { getRelatedFacets, getRowsByCourseNumber } from "@/features/transfers/lib/seoQueries";
import { summarizeCoursePage } from "@/features/transfers/lib/seoSummaries";
import { canonicalPath, normalizeCourseNumber, slugify } from "@/features/transfers/lib/slug";
import { serializeJsonLd } from "@/lib/safeJsonLd";
import { getSiteUrl } from "@/lib/siteUrl";

const siteUrl = getSiteUrl();

type Params = { courseNumber: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { courseNumber } = await params;
  const normalizedCourse = normalizeCourseNumber(courseNumber);
  const rows = await getRowsByCourseNumber(normalizedCourse);

  if (rows.length === 0) {
    return {
      title: "Course Not Found | SNHU Transfers",
      robots: { index: false, follow: false },
    };
  }

  const title = `SNHU ${normalizedCourse} Transfer Options`;
  const description = `Find unofficial SNHU ${normalizedCourse} transfer options and accepted transfer credits, including providers, mapped titles, academic levels, and eligibility details.`;
  const canonical = canonicalPath(`/transfers/courses/${slugify(normalizedCourse)}`, siteUrl);

  return {
    title,
    description,
    alternates: { canonical },
    robots: {
      index: false,
      follow: false,
    },
    openGraph: { title, description, url: canonical },
    twitter: { card: "summary", title, description },
  };
}

export default async function CourseTransferPage({ params }: { params: Promise<Params> }) {
  const { courseNumber } = await params;
  const normalizedCourse = normalizeCourseNumber(courseNumber);

  const rows = await getRowsByCourseNumber(normalizedCourse);
  if (rows.length === 0) notFound();

  const related = getRelatedFacets(rows);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: `SNHU ${normalizedCourse} Transfer Options`,
        itemListElement: rows.slice(0, 50).map((row, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: row.title || `${normalizedCourse} Transfer Option`,
          url: canonicalPath(`/transfers/courses/${slugify(normalizedCourse)}`, siteUrl),
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "Transfers", item: `${siteUrl}/transfers` },
          { "@type": "ListItem", position: 3, name: normalizedCourse },
        ],
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader currentPage="transfers" />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[var(--spacing-container-max)] flex-1 flex-col gap-6 px-4 py-8 pb-52 md:pb-32 md:px-8"
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
        <section className="rounded-lg border border-surface-variant bg-surface-container-low p-5">
          <h1 className="font-[family-name:var(--font-headline)] text-2xl font-semibold text-primary md:text-3xl">
            SNHU {normalizedCourse} Transfer Options
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant md:text-base">
            {summarizeCoursePage(normalizedCourse, rows)}
          </p>
          <p className="mt-4 text-xs text-on-surface-variant">
            <strong className="text-on-surface">Disclaimer:</strong> This is an unofficial compilation.
            Remember to double-check the official SNHU website for transfer eligibility, and always verify with your advisor.
          </p>
          <p className="mt-4 text-sm">
            <Link
              href={`/courses/${encodeURIComponent(normalizedCourse)}`}
              className="text-secondary transition-colors hover:text-primary hover:underline"
            >
              View prerequisites
            </Link>
          </p>
        </section>

        <EquivalencyTable rows={rows} />

        <section className="grid gap-4 md:grid-cols-3">
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Related Subjects</h2>
            <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
              {related.subjects.slice(0, 12).map((subject) => (
                <li key={subject}>
                  <Link
                    href={`/transfers/subjects/${slugify(subject)}`}
                    className="hover:text-primary hover:underline"
                  >
                    {subject}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Related Organizations</h2>
            <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
              {related.organizations.slice(0, 12).map((org) => (
                <li key={org}>
                  <Link
                    href={`/transfers/organizations/${slugify(org)}`}
                    className="hover:text-primary hover:underline"
                  >
                    {org}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Related Levels</h2>
            <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
              {related.levels.slice(0, 12).map((level) => (
                <li key={level}>
                  <Link
                    href={`/transfers/levels/${slugify(level)}`}
                    className="hover:text-primary hover:underline"
                  >
                    {level}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
