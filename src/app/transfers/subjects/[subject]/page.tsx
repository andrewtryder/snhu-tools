import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { EquivalencyTable } from "@/features/transfers/components/EquivalencyTable";
import {
  getRelatedFacets,
  getRowsBySubject,
  resolveSubjectBySlug,
} from "@/features/transfers/lib/seoQueries";
import { summarizeSubjectPage } from "@/features/transfers/lib/seoSummaries";
import { canonicalPath, slugify } from "@/features/transfers/lib/slug";
import { serializeJsonLd } from "@/lib/safeJsonLd";
import { getSiteUrl } from "@/lib/siteUrl";

const siteUrl = getSiteUrl();

type Params = { subject: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { subject } = await params;
  const subjectValue = await resolveSubjectBySlug(subject);

  if (!subjectValue) {
    return {
      title: "Subject Not Found | SNHU Transfers",
      robots: { index: false, follow: false },
    };
  }

  const title = `SNHU ${subjectValue} Transfer Equivalencies`;
  const description = `Browse unofficial SNHU ${subjectValue} transfer equivalencies and accepted transfer credits. Compare providers, course numbers, academic levels, and eligibility details.`;
  const canonical = canonicalPath(`/transfers/subjects/${subject}`, siteUrl);

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

export default async function SubjectPage({ params }: { params: Promise<Params> }) {
  const { subject } = await params;
  const subjectValue = await resolveSubjectBySlug(subject);
  if (!subjectValue) notFound();

  const rows = await getRowsBySubject(subjectValue);
  if (rows.length === 0) notFound();

  const related = getRelatedFacets(rows);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: `${subjectValue} SNHU Transfer Equivalencies`,
        itemListElement: rows.slice(0, 50).map((row, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: `${row.courseNumber || "Unknown"} - ${row.title || "Transfer"}`,
          url: row.courseNumber
            ? canonicalPath(`/transfers/courses/${slugify(row.courseNumber)}`, siteUrl)
            : canonicalPath(`/transfers/subjects/${subject}`, siteUrl),
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "Transfers", item: `${siteUrl}/transfers` },
          { "@type": "ListItem", position: 3, name: subjectValue },
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
            SNHU {subjectValue} Transfer Equivalencies
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant md:text-base">
            {summarizeSubjectPage(subjectValue, rows)}
          </p>
          <p className="mt-4 text-xs text-on-surface-variant">
            <strong className="text-on-surface">Disclaimer:</strong> This is an unofficial compilation.
            Remember to double-check the official SNHU website for transfer eligibility, and always verify with your advisor.
          </p>
        </section>

        <EquivalencyTable rows={rows} />

        <section className="grid gap-4 md:grid-cols-3">
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
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Related Courses</h2>
            <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
              {related.courses.slice(0, 12).map((course) => (
                <li key={course}>
                  <Link
                    href={`/transfers/courses/${slugify(course)}`}
                    className="hover:text-primary hover:underline"
                  >
                    {course}
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
