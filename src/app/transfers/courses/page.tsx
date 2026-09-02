import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { getCourseDirectoryEntries } from "@/features/transfers/lib/seoQueries";
import { canonicalPath } from "@/features/transfers/lib/slug";
import { getSiteUrl } from "@/lib/siteUrl";

const siteUrl = getSiteUrl();
const title = "SNHU Transfer Courses Directory";
const description =
  "Browse the full directory of SNHU course numbers with unofficial transfer equivalency options.";
const canonical = canonicalPath("/transfers/courses", siteUrl);

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: { title, description, url: canonical },
  twitter: { card: "summary", title, description },
};

export default async function CoursesDirectoryPage() {
  await connection();
  let entries: Awaited<ReturnType<typeof getCourseDirectoryEntries>> = [];
  let dataUnavailable = false;
  try {
    entries = await getCourseDirectoryEntries();
  } catch (error) {
    console.error("Failed to load transfer course directory:", error);
    dataUnavailable = true;
  }

  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = entry.subjectPrefix || "Other";
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader currentPage="transfers" />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[var(--spacing-container-max)] flex-1 flex-col gap-6 px-4 py-8 pb-52 md:pb-32 md:px-8"
      >
        <section className="rounded-lg border border-surface-variant bg-surface-container-low p-5">
          <h1 className="font-[family-name:var(--font-headline)] text-2xl font-semibold text-primary md:text-3xl">
            SNHU Transfer Courses Directory
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant md:text-base">
            All SNHU course numbers with listed transfer options, grouped by subject prefix.
          </p>
        </section>

        {sortedGroups.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            {dataUnavailable
              ? "Transfer courses are temporarily unavailable. Please try again shortly."
              : "No courses are available yet."}
          </p>
        ) : (
          sortedGroups.map(([subjectPrefix, courses]) => (
            <section
              key={subjectPrefix}
              className="rounded-lg border border-surface-variant bg-surface-container-low p-5"
            >
              <h2 className="text-sm font-semibold text-on-surface">{subjectPrefix}</h2>
              <ul className="mt-3 columns-1 gap-x-8 sm:columns-2 md:columns-3">
                {courses.map((course) => (
                  <li key={`${subjectPrefix}-${course.value}`} className="mb-1 break-inside-avoid text-sm">
                    <Link
                      href={`/transfers/courses/${course.slug}`}
                      className="text-on-surface-variant transition-colors hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {course.value} ({course.count})
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
      <AppFooter />
    </div>
  );
}
