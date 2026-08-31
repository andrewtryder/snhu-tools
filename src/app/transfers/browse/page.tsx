import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { canonicalPath } from "@/features/transfers/lib/slug";
import { getSiteUrl } from "@/lib/siteUrl";

const siteUrl = getSiteUrl();
const title = "Browse SNHU Transfer Equivalencies";
const description =
  "Browse unofficial SNHU transfer equivalencies by course, subject, organization, or academic level.";
const canonical = canonicalPath("/transfers/browse", siteUrl);

export const metadata: Metadata = {
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

const sections = [
  {
    href: "/transfers/courses",
    title: "Browse by Course",
    description: "Directory of SNHU course numbers with listed transfer options.",
  },
  {
    href: "/transfers/subjects",
    title: "Browse by Subject",
    description: "Alphabetical subject areas with transfer equivalency listings.",
  },
  {
    href: "/transfers/organizations",
    title: "Browse by Organization",
    description: "Providers and organizations mapped to SNHU transfer credits.",
  },
  {
    href: "/transfers/levels",
    title: "Browse by Academic Level",
    description: "Transfer equivalencies grouped by academic level.",
  },
] as const;

export default function BrowsePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader currentPage="transfers" />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[var(--spacing-container-max)] flex-1 flex-col gap-6 px-4 py-8 pb-52 md:pb-32 md:px-8"
      >
        <section className="rounded-lg border border-surface-variant bg-surface-container-low p-5">
          <h1 className="font-[family-name:var(--font-headline)] text-2xl font-semibold text-primary md:text-3xl">
            Browse SNHU Transfer Equivalencies
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant md:text-base">
            Choose a directory to explore crawlable lists of courses, subjects, organizations, and academic
            levels.
          </p>
        </section>

        <section aria-label="Browse directories" className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-lg border border-surface-variant bg-surface-container-low p-5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <h2 className="text-base font-semibold text-on-surface">{section.title}</h2>
              <p className="mt-2 text-sm text-on-surface-variant">{section.description}</p>
            </Link>
          ))}
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
